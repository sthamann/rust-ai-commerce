#!/usr/bin/env python3
"""Actual app UI registry/API/MCP/data/staging and slow-service isolation against Rust/PostgreSQL."""
from testing.app_approval import consent
from testing.app_approval import pin
import concurrent.futures
import copy
import hashlib
import importlib.util
import json
import os
import pathlib
import socket
import subprocess
import tempfile
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import uuid

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHECKS = []


def port():
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def passed(name):
    CHECKS.append(name)
    print("PASS", name)


def run():
    api_port, service_port = port(), port()
    base = f"http://127.0.0.1:{api_port}"
    app_id = "lab_" + uuid.uuid4().hex[:12]
    processes = []
    with tempfile.TemporaryDirectory() as directory:
        os.environ["APP_TOKEN"] = uuid.uuid4().hex
        os.environ["APP_DB"] = str(pathlib.Path(directory) / "app.sqlite")
        spec = importlib.util.spec_from_file_location("product_lab", ROOT / "extensions/apps/product-lab/server.py")
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        model_requests = []
        class Model(module.BaseHTTPRequestHandler):
            def log_message(self, *_):
                pass
            def do_POST(self):
                request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
                model_requests.append(request)
                proposal = {"summary": "Review an app-owned guide", "changes": [], "app_action": {"app": app_id, "action": "save_entry", "arguments_json": json.dumps({"id": "zz-last", "fields": {"product_id": "mug", "title": {"en": "Approved revision"}, "specification": {"care": ["handwash"]}}})}}
                if request["text"]["format"]["schema"].get("required")==["tool_calls"]: proposal={"tool_calls":[]}
                raw = json.dumps({"status":"completed","output":[{"content":[{"type":"output_text","text":json.dumps(proposal)}]}]}).encode()
                self.send_response(200)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(raw)))
                self.end_headers()
                self.wfile.write(raw)
        model_server = module.ThreadingHTTPServer(("127.0.0.1", 0), Model)
        model_thread = threading.Thread(target=model_server.serve_forever)
        model_thread.start()
        active = 0
        lock = threading.Lock()

        class Fixture(module.Handler):
            def do_POST(self):
                nonlocal active
                if self.path != "/actions/slow":
                    return super().do_POST()
                if self.headers.get("Authorization") != "Bearer " + module.TOKEN:
                    return self.send(401, {})
                self.rfile.read(int(self.headers["Content-Length"]))
                with lock:
                    active += 1
                try:
                    time.sleep(2)
                    self.send(200, {"done": True})
                finally:
                    with lock:
                        active -= 1

        server = module.ThreadingHTTPServer(("127.0.0.1", service_port), Fixture)
        thread = threading.Thread(target=server.serve_forever)
        thread.start()
        config = {app_id: {"url": f"http://127.0.0.1:{service_port}", "uiUrl": f"http://127.0.0.1:{service_port}", "token": module.TOKEN}}
        m = json.loads((ROOT / "extensions/apps/product-lab/manifest.json").read_text())
        m["id"] = app_id
        # Internal planning is independent of MCP, but never independent of action rights.
        save_action = next(a for a in m["actions"] if a["name"] == "save_entry")
        save_action.update(permission="orders.write", mcp=False)
        m["entities"].append({"name":"private_notes","label":m["name"],"publicRead":False,"fields":[{"name":"text","label":m["name"],"kind":"string","required":True}]})
        for name,handler,scope in [("list_notes","list","orders.read"),("save_notes","save","orders.write")]:
            note_action = copy.deepcopy(next(a for a in m["actions"] if a["handler"] == handler))
            note_action.update(name=name, description="Private scoped notes", entity="private_notes", public=False, permission=scope, mcp=False)
            m["actions"].append(note_action)
        m["intelligence"]["entities"].append("private_notes")
        busy = copy.deepcopy(m)
        busy["version"] = "1.2.0"
        busy["actions"].append({"name": "slow", "description": "Local slow fixture", "handler": "service", "entity": None, "readOnly": True, "permission": "catalog.read", "inputSchema": {"type": "object", "properties": {}, "additionalProperties": False}})
        config[app_id]["uiDigests"] = {"v1/index.html": hashlib.sha256(module.UI).hexdigest()}
        pin(config,app_id,m)
        pin(config,app_id,busy)
        env = {**os.environ, "APP_SERVICES": json.dumps(config), "PROCESS_ROLE": "http", "BIND_ADDR": f"127.0.0.1:{api_port}", "OPENAI_API_KEY": "local-wire-fixture", "OPENAI_BASE_URL": f"http://127.0.0.1:{model_server.server_address[1]}/v1"}

        def call(path, body=None, headers=None, expected=200, method=None):
            if path == '/api/apps' and isinstance(body,dict) and ('manifest' in body or 'builtIn' in body): body=consent(body)
            req = urllib.request.Request(base + path, data=None if body is None else json.dumps(body).encode(), headers={"Content-Type": "application/json", **(headers or {})}, method=method)
            try:
                with urllib.request.urlopen(req, timeout=20) as res:
                    code, value = res.status, json.load(res)
            except urllib.error.HTTPError as error:
                code, value = error.code, json.load(error)
            assert code == expected, (path, code, value, expected)
            return value

        def start(overrides=None):
            log = open(ROOT / ".run/app-surfaces-test.log", "ab")
            p = subprocess.Popen([str(ROOT / "target/debug/vendune")], cwd=ROOT, env={**env, **(overrides or {})}, stdout=log, stderr=log)
            log.close()
            processes.append(p)
            return p

        try:
            start()
            for _ in range(100):
                try:
                    call("/health")
                    break
                except OSError:
                    time.sleep(.1)
            def user():
                return call("/api/auth/register", {"email": uuid.uuid4().hex + "@example.test", "name": "App surfaces test", "password": "Synthetic-app-surface-2026!", "workspaceId": "surface-" + uuid.uuid4().hex[:12], "workspaceName": "Synthetic app workspace"})
            u, other = user(), user()
            h = {"Authorization": "Bearer " + u["token"], "x-tenant": u["workspace"]}
            oh = {"Authorization": "Bearer " + other["token"], "x-tenant": other["workspace"]}
            public = {"x-tenant": u["workspace"]}
            call("/api/apps", {"manifest": m}, h)
            private = call("/api/apps/surfaces", headers=h)["surfaces"]
            exposed = call("/store-api/apps/surfaces", headers=public)["surfaces"]
            assert [s["surface"]["location"] for s in private] == ["admin.navigation"]
            assert len(exposed) == 2 and all(not s["surface"]["location"].startswith("admin.") for s in exposed)
            assert module.TOKEN not in json.dumps([private, exposed])
            grant_path = f"/api/apps/{app_id}/surfaces/manager"
            # Surface names come from the installed contract, never from a caller-made alias.
            grant_path = f"/api/apps/{app_id}/surfaces/" + private[0]["surface"]["id"]
            grant = call(grant_path+"/grant", {"context":{}}, h)
            ui = call(grant_path+"/bundle", {"grant":grant["token"]}, h)
            assert "question-form" in ui["html"] and "function connectCommerce" in ui["html"]
            assert "src=\"./app.js\"" not in ui["html"]
            call(grant_path+"/bundle", {"grant":grant["token"]}, oh, expected=401)
            call(grant_path+"/bundle", {"grant":"0"*64}, h, expected=401)
            original = module.UI
            module.UI = original + b"<!-- changed after approval -->"
            call(grant_path+"/bundle", {"grant":grant["token"]}, h, expected=403)
            module.UI = original
            call("/api/apps/surfaces", headers=public, expected=401)
            passed("Private and public surfaces use actor-bound pinned self-contained UI; changed bytes and foreign actors are rejected")
            fields = {"product_id": "mug", "title": m["name"], "specification": {"materials": ["ceramic"], "care": {"dishwasher": True}}}
            call(f"/api/apps/{app_id}/http/guides", {"id": "a", "revision": 0, "fields": fields}, h)
            call(f"/api/apps/{app_id}/http/guides", {"id": "b", "revision": 0, "fields": {**fields, "product_id": "chair"}}, h)
            call(f"/api/apps/{app_id}/http/guides", {"id": "c", "revision": 0, "fields": fields}, h)
            call(f"/api/apps/{app_id}/http/guides", {"id": "a", "revision": 0, "fields": fields}, h, expected=409)
            path = f"/store-api/apps/{app_id}/http/guides"
            page = call(path + "?limit=1", headers=public)
            assert page["elements"][0]["specification"] == fields["specification"] and page["nextCursor"] == "a"
            assert call(path + "?limit=1&after=a", headers=public)["elements"][0]["id"] == "b"
            q = urllib.parse.urlencode({"filter": json.dumps({"product_id": "mug"})})
            assert [r["id"] for r in call(path + "?" + q, headers=public)["elements"]] == ["a", "c"]
            call(path + "?limit=101", headers=public, expected=400)
            call(path + "?filter=" + urllib.parse.quote('{"unknown":"x"}'), headers=public, expected=400)
            call(f"/store-api/apps/{app_id}/http/guides", {"id": "evil", "fields": fields}, public, expected=404)
            passed("Nested JSON persists; keyset pages and indexed filters work; stale/public writes and oversized pages fail")
            # A record beyond the first hundred must still bind its actual optimistic revision.
            for n in range(100):
                call(f"/api/apps/{app_id}/http/guides", {"id": f"page-{n:03}", "revision": 0, "fields": fields}, h)
            call(f"/api/apps/{app_id}/http/guides", {"id": "zz-last", "revision": 0, "fields": fields}, h)
            chat = call("/api/agent/chat", {"message": "Propose changing only the zz-last guide.", "inference": {"provider":"openai", "model":"local-fixture"}}, h)
            preview = chat["messages"][-1]["data"]["preview"]
            task_id = chat["messages"][-1]["data"]["taskId"]
            context = next(item for item in preview["appContext"] if item["app"] == app_id)
            assert len(context["records"][0]["records"]["elements"]) == 12
            assert {a["name"] for a in context["actions"]} == {"catalog", "save_entry", "recommend"}
            assert "support_received" not in model_requests[-1]["input"]
            assert len(json.dumps(preview["appContext"]).encode()) < 32768
            model_context = json.dumps(preview['modelAppContext'], separators=(',',':'), ensure_ascii=False)
            assert len(model_context.encode()) <= 4000
            assert model_context in model_requests[-1]['input'], 'Recorded model app context differs from the actual provider input'
            assert preview['modelAppContext'] != preview['appContext'], 'Oversized review records must not bypass the model budget'
            bound = json.loads(preview["proposal"]["app_action"]["arguments_json"])
            assert bound["revision"] == 1
            assert call(path + "?after=zz&limit=1", headers=public)["elements"][0]["revision"] == 1
            call("/api/agent/tasks/" + task_id + "/apply", {"approve":True}, h)
            assert call(path + "?after=zz&limit=1", headers=public)["elements"][0]["revision"] == 2
            passed("Actual model wire receives only selected bounded app context; approval updates a record beyond the first page")
            call(f"/api/apps/{app_id}/actions/save_notes", {"id":"private","fields":{"text":"ONLY-ORDER-READ-SENTINEL"}}, h)
            owner_plan = call("/api/agent/plan", {"instruction":"Update zz-last only", "inference":{"provider":"openai","model":"local-fixture"}}, h)
            key = call("/api/workspace/integrations", {"name":"Restricted planner","permissions":["catalog.read","catalog.write","knowledge.read"],"expiresInDays":1}, h)
            restricted = {"x-tenant":u["workspace"],"Authorization":"Bearer "+key["key"]}
            call("/api/agent/tasks/"+owner_plan["taskId"]+"/apply", {"approve":True}, restricted, expected=403)
            call("/api/agent/plan", {"instruction":"Update zz-last only","inference":{"provider":"openai","model":"local-fixture"}}, restricted, expected=403)
            assert "ONLY-ORDER-READ-SENTINEL" not in model_requests[-1]["input"]
            assert "save_entry" not in model_requests[-1]["input"]
            denied = call("/mcp", {"jsonrpc":"2.0","id":3,"method":"tools/call","params":{"name":f"app.{app_id}.save_entry","arguments":{"id":"x","fields":fields}}}, h)
            assert denied["result"]["isError"]
            passed("MCP-disabled internal planning works; restricted model grounding/proposals and approval cannot bypass current app scopes")

            call("/api/apps", {"manifest": m}, oh)
            assert call(path, headers={"x-tenant": other["workspace"]})["elements"] == []
            tools = call("/mcp", {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}, h)["result"]["tools"]
            assert any(t["name"] == f"app.{app_id}.recommend" and t["annotations"]["readOnlyHint"] for t in tools)
            args = {"productId": "mug", "question": "Wie pflegen?", "locale": "de-DE"}
            answer = call(f"/store-api/apps/{app_id}/http/advice", args, public)
            mcp = call("/mcp", {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {"name": f"app.{app_id}.recommend", "arguments": args}}, h)["result"]["structuredContent"]
            assert answer == mcp and "spülmaschinen" in answer["answer"]
            passed("HTTP and agent/MCP consume the same custom service action; app data remains tenant-isolated")
            for mutate in (lambda x: x["surfaces"][1]["actions"].append("save_entry"), lambda x: x["surfaces"][0].update(uiPath="../other"), lambda x: x["apiRoutes"][0].update(method="GET", action="support_received")):
                broken = copy.deepcopy(m)
                broken["version"] = "2.0.0"
                mutate(broken)
                call("/api/apps", {"manifest": broken}, h, expected=400)
            passed("Unsafe paths, private tools on public surfaces and mutating GET contracts are rejected")
            invitation = call("/api/workspace/invitations", {"email": uuid.uuid4().hex + "@example.test", "role": "viewer"}, h)
            reader = call("/api/auth/accept", {"invitationToken": invitation["token"], "name": "App reader", "password": "Synthetic-app-reader-2026!"})
            rh = {"Authorization": "Bearer " + reader["token"], "x-tenant": u["workspace"]}
            call(f"/api/apps/{app_id}/http/guides", {"id": "x", "fields": fields}, rh, expected=403)
            passed("Namespaced custom routes preserve current merchant permissions")
            stage = call("/api/environments", {"name": "App surface branch"}, h)["id"]
            build = call("/api/developer/import", {"environment": stage, "prompt": "Review external Product Lab package", "summary": m["name"], "manifest": m}, h)
            call("/api/developer/builds/" + build["id"] + "/stage", {"approve": True, "digest": build["digest"]}, h)
            sh = {**h, "x-tenant": stage}
            call(f"/api/apps/{app_id}/actions/recommend", args, sh, expected=400)
            passed("Reviewed external app manifests can be staged; private sandboxes cannot execute live service actions")
            call("/api/apps", {"manifest": busy}, h)
            with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
                tasks = [pool.submit(call, f"/api/apps/{app_id}/actions/slow", {}, h) for _ in range(8)]
                for _ in range(100):
                    with lock:
                        if active == 8:
                            break
                    time.sleep(.01)
                with lock:
                    assert active == 8
                call(f"/api/apps/{app_id}/actions/slow", {}, h, expected=429)
                started = time.perf_counter()
                cart = call("/store-api/checkout/cart", {"session": uuid.uuid4().hex}, public)
                core_ms = (time.perf_counter() - started) * 1000
                assert cart["status"] == "open" and not all(t.done() for t in tasks)
                assert call(f"/store-api/apps/{app_id}/http/advice", args, {"x-tenant": other["workspace"]})["answer"]
                for task in tasks:
                    assert task.result()["done"]
            passed("Eight slow app calls trigger bounded admission; real cart creation and a second tenant continue independently")
            package = next(p for p in call("/api/apps", headers=h)["packages"] if p["id"] == app_id)
            call(f"/api/apps/{app_id}", {"active": False, "revision": package["revision"]}, h, method="PUT")
            assert not call("/store-api/apps/surfaces", headers=public)["surfaces"]
            call(path, headers=public, expected=409)
            passed("Deactivation removes navigation/surfaces and blocks routes while retaining versioned app data")
            report = {"passed": len(CHECKS), "checks": CHECKS, "coreCartDuringBusyAppMs": round(core_ms, 3), "runtime": "debug local synthetic database; not a production capacity benchmark", "paidModelCalls": 0}
            pathlib.Path(os.getenv("REPORT_PATH", str(ROOT / ".run/app-surfaces-report.json"))).write_text(json.dumps(report, indent=2) + "\n")
            print(json.dumps(report))
        finally:
            for p in reversed(processes):
                if p.poll() is None:
                    p.terminate()
                    p.wait(15)
            model_server.shutdown()
            model_server.server_close()
            model_thread.join()
            server.shutdown()
            server.server_close()
            thread.join()


if __name__ == "__main__":
    run()
