# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 0.1.x   | :white_check_mark: |

Only the latest published `depmod-ui` release on npm receives security fixes.
Older versions are not maintained.

## Reporting a Vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

Email **lupu.eduard.adrian@gmail.com** with:

- A description of the issue and its potential impact
- Steps to reproduce (proof-of-concept if possible)
- Affected version(s) and environment (Node version, OS)

You should receive an acknowledgement within **72 hours**. We will work with you
on a fix timeline and coordinate disclosure once a patch is available.

## Scope

In scope:

- Remote code execution or arbitrary file access via `depmod-ui` when analyzing
  a malicious or crafted project
- Path traversal or session-file leaks in the bundled dashboard server
- Supply-chain issues in published npm artifacts

Out of scope:

- Vulnerabilities in projects you analyze with depmod (depmod only reads files;
  it does not execute project code)
- Denial-of-service from analyzing extremely large repositories (documented
  limitation; use `--exclude` / path masks)

## Safe Defaults

`depmod-ui` binds to `127.0.0.1` by default. Do not expose the dashboard to
untrusted networks without understanding that it serves graph data from whatever
path you pointed it at.
