package com.dsv.edinav.workflow.dto;

/** A branching edge in an imported sub-workflow; {@code from}/{@code to} reference step {@code ref} keys. */
public record ImportTransition(
        String from,
        String to,
        String label
) {}
