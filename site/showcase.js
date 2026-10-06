// Progressive enhancement for the demo chapters and unedited screenshot viewer.
const showcase = document.querySelector("[data-showcase]");
if (showcase) {
  const tabs = [...showcase.querySelectorAll('[role="tab"]')];
  const panels = tabs.map((tab) =>
    document.getElementById(tab.getAttribute("aria-controls")),
  );
  let current = 0;
  const choose = (index, focus = false) => {
    current = index;
    tabs.forEach((tab, i) => {
      tab.setAttribute("aria-selected", String(i === index));
      tab.tabIndex = i === index ? 0 : -1;
      panels[i].hidden = i !== index;
      if (i !== index) panels[i].querySelector("video").pause();
    });
    if (focus) tabs[index].focus();
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener("click", () => choose(index));
    tab.addEventListener("keydown", (event) => {
      const keys = {
        ArrowRight: (index + 1) % tabs.length,
        ArrowLeft: (index + tabs.length - 1) % tabs.length,
        Home: 0,
        End: tabs.length - 1,
      };
      if (!(event.key in keys)) return;
      event.preventDefault();
      choose(keys[event.key], true);
    });
  });
  showcase.querySelectorAll("[data-next-demo]").forEach((button) => {
    button.hidden = false;
    button.addEventListener("click", () =>
      choose((current + 1) % tabs.length, true),
    );
  });
  showcase.querySelectorAll("video").forEach((video) =>
    video.addEventListener("play", () => {
      showcase.querySelectorAll("video").forEach((other) => {
        if (other !== video) other.pause();
      });
    }),
  );
  choose(0);
  showcase.classList.add("is-enhanced");
}

const viewer = document.querySelector("[data-shot-viewer]");
if (viewer && typeof viewer.showModal === "function") {
  document.querySelectorAll("[data-open-shot]").forEach((link) =>
    link.addEventListener("click", (event) => {
      event.preventDefault();
      viewer.querySelector("img").src = link.href;
      viewer.querySelector("img").alt = link.querySelector("img").alt;
      viewer.querySelector("figcaption").textContent = link.dataset.caption;
      viewer.showModal();
    }),
  );
  viewer
    .querySelector("button")
    .addEventListener("click", () => viewer.close());
  viewer.addEventListener("click", (event) => {
    if (event.target === viewer) viewer.close();
  });
}
