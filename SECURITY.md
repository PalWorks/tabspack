# Security Policy

## Reporting a vulnerability

Do not open a public issue. Report privately through GitHub Security Advisories on this repository, using the Report a vulnerability button on the Security tab.

Include what you found, how to reproduce it, and what an attacker could achieve. You will get an acknowledgement, and a fix or an explanation of why it is not a vulnerability. Please give a reasonable window before disclosing publicly. This is a small project with no security team, so timelines are best effort and stated honestly rather than promised.

## Supported versions

Pre release. Nothing is published to a store yet, so there is nothing deployed to patch. Once v1 ships, the latest published version on each store is the only supported one.

## The threat model

TabsPack has no server, no account and no network access, so the attack surface is narrow and specific. These are the things that actually matter here.

### Table SE1: Threats and controls

| Threat | Why it matters | Control |
|---|---|---|
| A malicious `.tabspack.json` file | Files are shared by email and chat, so a user will open files from other people | Every file is treated as untrusted input. Parsed, validated against the schema, and never evaluated. No `eval`, no `Function`, no dynamic import of file content, no template rendering of file strings as HTML |
| Script injection through a title or a URL | A crafted title could carry markup into the preview or the placeholder page | All file derived strings are inserted as text nodes, never as HTML. The extension pages carry a restrictive `content_security_policy` with `script-src 'self'` and `object-src 'none'` |
| Being tricked into opening a dangerous URL | `javascript:` and `data:` URLs in a file could execute in a page context if opened | Those schemes are never opened programmatically. They are listed on the placeholder page as inert text, not as links |
| Favicon URLs used as a beacon | Fetching a `favIconUrl` from an imported file would leak that the file was opened, and to whom | Imported favicon URLs are never fetched during import. No remote resource is loaded by any extension page |
| Export leaking credentials | An export is shared far more casually than a password file | The format carries no cookies, tokens, headers, form values or storage contents. This is a format level MUST in `docs/SPEC.md` section 1 |
| Permission creep | A wide permission turns a low risk extension into a high risk one | Three required permissions, `tabs`, `storage` and `downloads`. No host permissions. `tabGroups` is optional and requested at first use, and nothing else is ever requested. Any change needs an ADR |
| Unauthorised extension messaging | Another extension or a page probing our message router | Every message handler checks the sender against `runtime.id` and rejects anything else. No `externally_connectable` |
| Supply chain | A compromised dependency would ship inside the extension | One runtime dependency, `webextension-polyfill`, vendored and reviewed. Development dependencies are pinned and a new one needs justification in the pull request |
| Remote code | Forbidden by store policy and a real risk | No remote script, no CDN, no hosted font. Everything is in the package |

## Secrets

There are none. No API key, no token, no signing credential belongs in this repository. Store publishing credentials live only in the maintainer's account and, if CI ever publishes, in repository secrets. Never in a file, never in a manifest, never in a commit.

## Scope

In scope: the extension source, the format specification, the build pipeline, anything that could execute code from a file or leak browsing data off the machine.

Out of scope: vulnerabilities in the browsers themselves, and social engineering of a user into restoring a pack of URLs they should not visit. A pack of links is exactly as dangerous as a list of links, which is the risk it openly presents.
