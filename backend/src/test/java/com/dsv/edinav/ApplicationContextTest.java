package com.dsv.edinav;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;

/** Smoke test: the full application context wires (no missing/circular beans) on a throwaway in-memory DB. */
@SpringBootTest(properties = {
        "spring.datasource.url=jdbc:h2:mem:ctxload;DB_CLOSE_DELAY=-1",
        "spring.jpa.hibernate.ddl-auto=create-drop",
})
class ApplicationContextTest {

    @Test
    void contextLoads() {
        // Fails if any bean (e.g. the split workflow services/controllers) cannot be wired.
    }
}
