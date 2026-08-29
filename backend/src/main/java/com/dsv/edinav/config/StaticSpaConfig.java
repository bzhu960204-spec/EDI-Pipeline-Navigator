package com.dsv.edinav.config;

import java.io.IOException;
import java.nio.file.Paths;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.Resource;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.ViewControllerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;
import org.springframework.web.servlet.resource.PathResourceResolver;

/**
 * Serves the pre-built React frontend from a filesystem directory so the whole
 * app runs on a single port (production / start-prod flow).
 *
 * Gated on {@code app.web.dist}: the dev flow (start-dev, Vite proxy) never sets
 * this property, so the backend keeps serving only /api and dev is unchanged.
 */
@Configuration
@ConditionalOnProperty(name = "app.web.dist")
public class StaticSpaConfig implements WebMvcConfigurer {

    private static final Logger log = LoggerFactory.getLogger(StaticSpaConfig.class);

    @Value("${app.web.dist}")
    private String distDir;

    @Override
    public void addViewControllers(ViewControllerRegistry registry) {
        // The resource handler below doesn't resolve the empty root path; forward it.
        registry.addViewController("/").setViewName("forward:/index.html");
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        String location = Paths.get(distDir).toAbsolutePath().normalize().toUri().toString();
        log.info("Serving static frontend from {}", location);

        registry.addResourceHandler("/**")
                .addResourceLocations(location)
                .resourceChain(true)
                .addResolver(new PathResourceResolver() {
                    @Override
                    protected Resource getResource(String resourcePath, Resource location) throws IOException {
                        Resource requested = location.createRelative(resourcePath);
                        if (requested.exists() && requested.isReadable()) {
                            return requested;
                        }
                        // Never hijack backend endpoints — let them 404 normally.
                        if (resourcePath.startsWith("api/")
                                || resourcePath.startsWith("h2-console")) {
                            return null;
                        }
                        // SPA fallback: unknown client routes load index.html.
                        Resource index = location.createRelative("index.html");
                        return (index.exists() && index.isReadable()) ? index : null;
                    }
                });
    }
}
