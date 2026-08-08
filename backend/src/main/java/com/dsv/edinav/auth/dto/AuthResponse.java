package com.dsv.edinav.auth.dto;

public record AuthResponse(
        String token,
        UserDto user
) {}
