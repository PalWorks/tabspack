# TabPack

## Business Requirements Document (BRD) & Product Requirements Document (PRD)

Version: 0.9 (Foundational Draft)

Author: ChatGPT

Date: 2026-07-14

------------------------------------------------------------------------

# Executive Summary

## Vision

TabPack aims to become the open standard for moving browser sessions
between browsers.

Rather than competing as another "tab manager", TabPack focuses on one
clear promise:

> Export, move, share, and restore browser tabs across browsers using an
> open, offline-first format.

The product consists of:

-   A cross-browser extension
-   An open `.tabpack` specification
-   A reference implementation
-   Future SDKs and integrations

------------------------------------------------------------------------

# Problem Statement

Current solutions emphasize tab reduction, memory savings, or
bookmarking.

Users instead face problems such as:

-   Migrating from one browser to another.
-   Backing up research sessions.
-   Sharing browser workspaces.
-   Recovering after crashes.
-   Preserving tab organization.

There is no widely adopted open interchange format comparable to PDF,
CSV, OPML, or ICS.

------------------------------------------------------------------------

# Product Positioning

Not:

-   Tab Manager
-   Bookmark Manager
-   Memory Saver

Instead:

-   Browser Migration Tool
-   Session Exchange Tool
-   Workspace Packaging Tool

------------------------------------------------------------------------

# Design Principles

1.  Offline first.
2.  Privacy first.
3.  Open specification.
4.  Human readable files.
5.  Zero vendor lock-in.
6.  One codebase across browsers.
7.  No account required.

------------------------------------------------------------------------

# Target Browsers

## Phase 1

-   Google Chrome
-   Microsoft Edge
-   Brave
-   Opera
-   Opera GX
-   Vivaldi
-   Firefox

## Later

-   Arc
-   Zen
-   Floorp

Safari excluded initially.

------------------------------------------------------------------------

# Primary User Stories

-   I want to move 150 tabs from Chrome to Firefox.
-   I want to back up my research before reinstalling Windows.
-   I want to send my teammate every tab used during today's meeting.
-   I want to restore only selected tabs.

------------------------------------------------------------------------

# MVP Scope

## Export

-   Current window
-   Selected tabs
-   All windows

## Import

-   TabPack
-   TXT
-   JSON

## Restore

-   Current window
-   New window

------------------------------------------------------------------------

# Deferred

-   Cloud sync
-   User accounts
-   AI
-   Bookmark management
-   Session scheduling

------------------------------------------------------------------------

# TabPack File Specification

Extension:

    .tabpack

Internally:

JSON UTF-8

Example:

``` json
{
  "version":1,
  "createdAt":"2026-07-14T09:00:00Z",
  "sourceBrowser":"Chrome",
  "windows":[
    {
      "name":"Research",
      "tabs":[
        {
          "url":"https://example.com",
          "title":"Example",
          "group":"AI",
          "pinned":false
        }
      ]
    }
  ]
}
```

Rules:

Mandatory:

-   url

Optional:

-   title
-   group
-   pinned
-   browser
-   profile
-   favicon
-   notes
-   tags

Unknown fields must be ignored.

------------------------------------------------------------------------

# Functional Requirements

## Export

FR-001 Export current window.

FR-002 Export selected tabs.

FR-003 Export all windows.

FR-004 Export TXT.

FR-005 Export JSON.

FR-006 Export TabPack.

------------------------------------------------------------------------

## Import

FR-101 Import TabPack.

FR-102 Import TXT.

FR-103 Import JSON.

FR-104 Validate schema.

FR-105 Preview before restore.

------------------------------------------------------------------------

## Restore

FR-201 Restore selected tabs.

FR-202 Restore into current window.

FR-203 Restore into new window.

FR-204 Skip invalid URLs.

FR-205 Warn about duplicates.

------------------------------------------------------------------------

# UX

Main screen:

    Export

    Current Window

    Selected Tabs

    Everything

    Import

    Choose File

    Recent Exports

Import preview:

    128 tabs

    Search

    Select All

    Research

    Shopping

    Development

    Restore

------------------------------------------------------------------------

# Architecture

TypeScript

Manifest V3

WebExtensions API

Shared abstraction layer for Firefox differences.

Modules:

-   UI
-   Browser adapter
-   Import engine
-   Export engine
-   Serializer
-   Validator
-   Storage
-   Settings

------------------------------------------------------------------------

# Permissions

-   tabs
-   storage
-   downloads

Avoid host permissions.

------------------------------------------------------------------------

# Non Functional Requirements

Startup:

\<100 ms

Export:

1000 tabs under 3 seconds.

Memory:

Under 100 MB.

Works offline.

No telemetry by default.

------------------------------------------------------------------------

# Roadmap

## V1

Migration

## V2

Duplicate detection

## V3

Workspace management

## V4

Sharing

## V5

SDK and ecosystem

------------------------------------------------------------------------

# Competitive Differentiation

Unlike traditional tab managers:

-   Open specification
-   Browser portability
-   Human-readable files
-   Offline by default
-   No vendor lock-in

------------------------------------------------------------------------

# Open Source Strategy

License:

MIT

Publish:

-   Specification
-   JSON Schema
-   Reference parser
-   Sample files

Encourage third-party implementations.

------------------------------------------------------------------------

# Risks

-   Browser API differences
-   Large session performance
-   Browser store review policies
-   Future API changes

Mitigation:

Adapter abstraction and comprehensive automated tests.

------------------------------------------------------------------------

# Testing

Unit

Integration

Cross-browser matrix

Large dataset testing

Malformed import testing

Backward compatibility testing

------------------------------------------------------------------------

# Future Opportunities

-   Native desktop app
-   CLI
-   GitHub integration
-   Slack integration
-   VS Code extension
-   Enterprise deployment
-   Encrypted TabPack
-   Digital signatures

------------------------------------------------------------------------

# Success Metrics

-   Weekly active users
-   Successful exports
-   Successful imports
-   Restore completion rate
-   Crash-free sessions
-   Community implementations of TabPack

------------------------------------------------------------------------

# Immediate Engineering Milestones

1.  Define JSON schema.
2.  Implement export engine.
3.  Implement import parser.
4.  Build preview UI.
5.  Implement restore.
6.  Cross-browser testing.
7.  Publish specification.
8.  Publish extension stores.

------------------------------------------------------------------------

# Conclusion

The long-term asset is not merely the browser extension.

The strategic asset is the TabPack specification.

If other tools adopt the format, TabPack can become the standard
interchange format for browser sessions in the same way that CSV became
the common interchange format for tabular data.
