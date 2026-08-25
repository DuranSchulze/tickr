# Feature: Configurable Workspace RBAC

## Overview

Workspace roles will combine a stable hierarchy level with configurable, action-level permissions. A central permission registry will let future features declare new capabilities in one place, while workspace owners can decide which non-owner roles receive those capabilities without relying on UI-only restrictions.

## Functional Requirements

### FR-001: Central permission registry

The system shall define every configurable capability in a typed registry containing a stable key, feature group, label, description, and default access by hierarchy level.

### FR-002: Future permission defaults

When a new permission is added to the registry, the system shall calculate access for roles without an explicit override from that permission's hierarchy defaults.

### FR-003: Workspace-specific overrides

While a role belongs to a workspace, when an authorized administrator changes its permissions, the system shall store only that role's explicit permission overrides in that workspace.

### FR-004: Effective permissions

When the system evaluates a capability, it shall merge registry defaults with the role's explicit overrides and return one effective boolean decision.

### FR-005: Owner safety

While a role has the Owner hierarchy level, the system shall grant every registered capability and shall prevent permission overrides from reducing Owner access.

### FR-006: Permission administration

While a member has the `roles.manage_permissions` capability, when they open the roles catalog, the system shall allow them to inspect and edit permissions for non-Owner roles.

### FR-007: Server enforcement

When a member invokes a protected server operation, the system shall evaluate the required capability and reject the operation when it is not granted.

### FR-008: Interface enforcement

While a capability is not granted, the system shall remove or disable the corresponding navigation item and action control without treating that UI state as the security boundary.

### FR-009: Existing behavior migration

When configurable RBAC is deployed, the system shall preserve the effective access currently provided by Owner, Admin, Manager, and Employee hierarchy levels until an authorized user changes an override.

### FR-010: Audit trail

When role permissions are changed, the system shall record the actor, workspace, role, and changed permission values in the workspace audit log.

## Non-Functional Requirements

### Performance

- Effective permission checks shall be in-memory and constant-time after workspace access is loaded.
- Loading workspace access shall not add an additional database round trip beyond the existing role relation query.
- Saving a role permission set shall use one scoped update statement.

### Security

- Every mutation shall validate that the target role belongs to the actor's active workspace.
- Unknown permission keys shall be rejected at the server boundary.
- Owner permissions shall be immutable and always resolve to full access.
- Permission changes shall require trusted-origin, authenticated workspace access.
- Direct server calls shall return a permission error even when the corresponding UI control is hidden.

### Scalability and maintainability

- Permission identifiers shall remain stable strings and shall not be coupled to route paths or component names.
- Newly registered permissions shall require no database migration.
- Missing or malformed stored overrides shall fail safely to hierarchy defaults.

## Acceptance Criteria

### AC-001: Edit a non-owner role

Given an authorized Owner or Admin is viewing the roles catalog
When they change a non-Owner role's permission and save
Then the effective permission is updated for members assigned to that role
And an audit event is recorded.

### AC-002: Reject an unauthorized permission change

Given a member does not have `roles.manage_permissions`
When they call the role-permission update operation directly
Then the operation is rejected
And no role data is changed.

### AC-003: Owner cannot be restricted

Given an Owner role is displayed in the permission editor
When a user inspects that role
Then every permission is enabled
And the controls cannot be changed or saved as restrictive overrides.

### AC-004: Preserve hierarchy defaults

Given an existing role has no stored overrides
When effective permissions are calculated
Then they match the role's current hierarchy behavior.

### AC-005: New feature permission

Given a new permission definition is added to the registry
When an existing role with no override is evaluated
Then the registry's hierarchy default determines access
And the permission automatically appears in the editor.

### AC-006: UI and server agree

Given a role lacks a protected capability
When a member assigned to that role views the application and calls the operation directly
Then the related navigation or action is unavailable
And the server independently rejects the call.

## Error Handling

| Error condition                   | Result                                             | User message                                             |
| --------------------------------- | -------------------------------------------------- | -------------------------------------------------------- |
| Unauthenticated request           | Reject request                                     | "Please sign in to continue."                            |
| Missing management permission     | Reject request                                     | "You do not have permission to manage role permissions." |
| Role belongs to another workspace | Treat as not found                                 | "Role not found in this workspace."                      |
| Attempt to restrict Owner         | Reject request                                     | "Owner permissions cannot be changed."                   |
| Unknown permission key            | Reject validation                                  | "One or more permissions are not supported."             |
| Concurrent role update            | Last valid update wins; audit both accepted writes | Standard success/error feedback                          |

## Implementation TODO

### Backend

- [x] Add JSON permission-overrides storage to workspace roles.
- [x] Add the typed permission registry, defaults, and effective-access helpers.
- [x] Return effective permissions with workspace access.
- [x] Add a workspace-scoped role-permission update operation.
- [x] Replace representative hard-coded gates with capability checks.
- [x] Record permission update audit events.

### Frontend

- [x] Display a permission editor on the roles catalog.
- [x] Group permission controls by product feature.
- [x] Explain inherited defaults versus explicit overrides.
- [x] Lock Owner controls and show the safety rationale.
- [x] Use effective permissions for navigation and management controls.
- [x] Add loading, success, and error feedback.

### Testing

- [x] Unit-test defaults, overrides, unknown stored keys, and Owner invariants.
- [x] Regression-test preserved hierarchy behavior.
- [x] Typecheck and lint.
- [x] Smoke-test the roles catalog and permission editor in the browser.

## Out of Scope

- Per-user permission overrides outside assigned workspace roles.
- Attribute-based rules beyond existing department and ownership scopes.
- User-authored custom permission identifiers.
- Deny rules that override Owner access.

## Decisions

- Hierarchy remains the source of safe defaults and scope semantics.
- Explicit role overrides provide flexibility.
- New permissions inherit their registry defaults until deliberately overridden.
- Owner is immutable full access to prevent workspace lockout.
