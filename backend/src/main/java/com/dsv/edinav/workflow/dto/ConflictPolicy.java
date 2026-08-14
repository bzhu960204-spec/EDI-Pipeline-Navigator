package com.dsv.edinav.workflow.dto;

/** How a batch import handles a workflow whose name already exists in this instance. */
public enum ConflictPolicy {
    /** Leave the existing workflow untouched and report the incoming one as skipped. */
    SKIP,
    /** Import under an auto-generated unique name (e.g. "Name (imported)"). */
    RENAME
}
