package com.dsv.edinav.auth;

import com.dsv.edinav.auth.dto.AuthResponse;
import com.dsv.edinav.auth.dto.LoginRequest;
import com.dsv.edinav.auth.dto.RegisterRequest;
import com.dsv.edinav.auth.dto.UserDto;
import com.dsv.edinav.common.ApiException;
import com.dsv.edinav.security.JwtService;
import com.dsv.edinav.user.Role;
import com.dsv.edinav.user.User;
import com.dsv.edinav.user.UserRepository;
import org.springframework.http.HttpStatus;
import org.springframework.security.authentication.AuthenticationManager;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
public class AuthService {

    private final UserRepository userRepository;
    private final PasswordEncoder passwordEncoder;
    private final AuthenticationManager authenticationManager;
    private final JwtService jwtService;

    public AuthService(UserRepository userRepository,
                       PasswordEncoder passwordEncoder,
                       AuthenticationManager authenticationManager,
                       JwtService jwtService) {
        this.userRepository = userRepository;
        this.passwordEncoder = passwordEncoder;
        this.authenticationManager = authenticationManager;
        this.jwtService = jwtService;
    }

    public AuthResponse register(RegisterRequest request) {
        if (userRepository.existsByUsername(request.username())) {
            throw new ApiException(HttpStatus.CONFLICT, "Username already taken");
        }
        User user = new User();
        user.setUsername(request.username());
        user.setPasswordHash(passwordEncoder.encode(request.password()));
        String displayName = (request.displayName() == null || request.displayName().isBlank())
                ? request.username() : request.displayName();
        user.setDisplayName(displayName);
        user.setRole(Role.USER);
        userRepository.save(user);
        return issueToken(user);
    }

    public AuthResponse login(LoginRequest request) {
        authenticationManager.authenticate(
                new UsernamePasswordAuthenticationToken(request.username(), request.password()));
        User user = userRepository.findByUsername(request.username())
                .orElseThrow(() -> new ApiException(HttpStatus.UNAUTHORIZED, "Invalid username or password"));
        return issueToken(user);
    }

    public UserDto toDto(User user) {
        return new UserDto(user.getId(), user.getUsername(), user.getDisplayName(), user.getRole().name());
    }

    private AuthResponse issueToken(User user) {
        String token = jwtService.generateToken(user.getUsername(), user.getId(), user.getRole().name());
        return new AuthResponse(token, toDto(user));
    }
}
