# Studio facts

`revenue.rs` groups immutable invoice amounts by currency using PostgreSQL numeric
aggregation. The parent `studio.rs` exposes these groups to merchant chat/dashboard
consumers. A mixed-currency shop has no single unqualified revenue amount. The
currency integration suite verifies two real differently denominated orders.
