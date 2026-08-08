package com.dsv.edinav.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "app")
public class AppProperties {

    private final Jwt jwt = new Jwt();
    private final Admin admin = new Admin();
    private final Storage storage = new Storage();
    private final Cors cors = new Cors();

    public Jwt getJwt() { return jwt; }
    public Admin getAdmin() { return admin; }
    public Storage getStorage() { return storage; }
    public Cors getCors() { return cors; }

    public static class Jwt {
        private String secret;
        private long expirationMs = 86_400_000L;
        public String getSecret() { return secret; }
        public void setSecret(String secret) { this.secret = secret; }
        public long getExpirationMs() { return expirationMs; }
        public void setExpirationMs(long expirationMs) { this.expirationMs = expirationMs; }
    }

    public static class Admin {
        private String username = "admin";
        private String password = "admin123";
        public String getUsername() { return username; }
        public void setUsername(String username) { this.username = username; }
        public String getPassword() { return password; }
        public void setPassword(String password) { this.password = password; }
    }

    public static class Storage {
        private String root = "./data/artifacts";
        public String getRoot() { return root; }
        public void setRoot(String root) { this.root = root; }
    }

    public static class Cors {
        private String allowedOrigins = "http://localhost:5173";
        public String getAllowedOrigins() { return allowedOrigins; }
        public void setAllowedOrigins(String allowedOrigins) { this.allowedOrigins = allowedOrigins; }
    }
}
