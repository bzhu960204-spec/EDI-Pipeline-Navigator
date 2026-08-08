package com.dsv.edinav.auth.dto;

public record UserDto(
        Long id,
        String username,
        String displayName,
        String role
) {}
