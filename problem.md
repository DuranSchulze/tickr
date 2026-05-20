# Problem Discussion: Timer Entry Lag on Stop and New Entry

## Overview

A noticeable lag occurs in the time tracking flow specifically at the moment a user stops an active timer and attempts to create or start a new entry immediately after. The experience leading up to the stop works correctly, but the transition between stopping one entry and beginning the next introduces friction.

---

## User Flow

### Step 1 — Setting Up the Entry

The user opens the time tracker and begins filling in a new time entry. They:

- Type in a task description / entry name
- Select a **Client** and a **Project** associated with that client
- Optionally attach one or more **Tags** to the entry

At this point everything is responsive. The dropdowns load, the selections are saved to local state, and the UI reflects their choices immediately.

### Step 2 — Starting the Timer

The user presses the **Start** button to begin tracking time against the configured entry. This action succeeds — the timer begins, the running indicator appears, and the elapsed time starts counting up in the UI. No lag or error is reported here.

### Step 3 — Working / Timer Running

The user continues their work with the timer running in the background. The live timer ticks upward. This phase has no reported issues.

### Step 4 — Stopping the Timer

The user finishes their task and presses **Stop** to end the current timer. This triggers:

- Writing the completed time entry to the database (workspaceId, userId, projectId, clientId, tags, start time, end time, duration)
- Clearing or resetting the active timer state
- Updating any summary views or totals that depend on the new entry

This is where the problem begins. The stop action initiates a network round trip to persist the entry. The user experiences a delay here — the UI may briefly stall, show a loading state, or feel unresponsive while the save completes.

### Step 5 — Attempting to Create the Next Entry (The Core Problem)

Immediately after stopping, the user wants to start tracking something new. They attempt to:

- Clear the previous task description and type a new one, OR
- Change the Client / Project to something different, OR
- Simply hit Start again with or without changes to begin a new timer

**This is where the lag manifests most visibly.** The issue is that the system is still processing the stop from Step 4 while the user has already moved on to configuring their next entry. The following friction points are observed:

- The UI may not have fully reset from the previous entry, leaving stale data (old task name, old project, old tags) still visible or partially cleared
- The Start button may be temporarily disabled or unresponsive while the previous stop operation is completing in the background
- If the user types quickly into the task field or changes the project selection before the previous save has settled, their inputs may be overwritten or lost when the save finally completes and triggers a state refresh
- In some cases, the new entry appears to start but then snaps back or resets — as if the completion of the previous stop's network request caused a re-render that wiped the new inputs
- Tag selections made for the new entry may disappear
- There is observable hesitation between the moment the user intends to act and when the UI becomes ready to accept those actions

---

## Nature of the Lag

The lag is not a one-time occurrence — it is reproducible whenever a user works at a normal pace, stopping one entry and quickly starting another. Users who track time frequently throughout the day (switching tasks every 15–60 minutes) encounter this repeatedly. The delay is short enough that users do not think the system is broken, but long enough to interrupt their flow and require them to re-enter information they already typed.

The problem is especially noticeable when:

- The user has a slow or inconsistent internet connection (the save round trip takes longer)
- The user is working with multiple tags (more data being written)
- The previous entry had a long duration or complex project/client association
- The user is switching to a completely different Client and Project for the next entry, requiring them to interact with multiple dropdowns in rapid succession

---

## Impact on the User

The cumulative effect is subtle but meaningful. A user who tracks time many times per day:

- Has to wait before they can start the next task
- Risks losing task description text they typed during the lag window
- May unknowingly start an entry under the wrong project if the dropdowns snapped back and they did not notice
- Loses confidence in whether their data was saved correctly, sometimes leading them to check the entry list to verify — adding more overhead to an action that should be instant

The expectation the user brings to this interaction is that stopping and starting entries should feel like flipping a switch — immediate and reliable. The current experience falls short of that expectation at the critical handoff moment between one tracked task and the next.
