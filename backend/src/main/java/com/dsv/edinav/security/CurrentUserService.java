package com.dsv.edinav.security;

import com.dsv.edinav.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.stereotype.Component;

/** Resolves the id of the currently authenticated user for owner-scoped data access. */
@Component
public class CurrentUserService {

    public Long requireUserId() {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        if (auth != null && auth.getPrincipal() instanceof AppUserPrincipal principal) {
            return principal.getId();
        }
        throw new ApiException(HttpStatus.UNAUTHORIZED, "Not authenticated");
    }
}
