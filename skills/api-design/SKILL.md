---
name: api-design
description: Design REST and GraphQL APIs. Use when creating new endpoints, designing API contracts, or planning API versioning. Ensures consistent, well-documented, future-proof APIs.
argument-hint: "[api description]"
---

# API Design

Design APIs that are predictable, consistent, and easy to consume. No code until the contract is approved.

<HARD-GATE>
No endpoint implementation until the API contract (resources, methods, status codes, error format) is written down and approved.
</HARD-GATE>

## Process

1. **Identify resources** - what nouns does the domain expose?
2. **Map operations** - CRUD vs custom actions. Prefer REST conventions
3. **Define status codes** - 200, 201, 204, 400, 401, 403, 404, 409, 422, 500
4. **Error format** - consistent envelope: `{ error: { code, message, details } }`
5. **Pagination** - cursor-based for large sets, offset for small
6. **Versioning** - URL prefix (`/api/v1/`) or header. Pick one, document it
7. **Write the contract** - save to `docs/specs/YYYY-MM-DD-api.md`
8. **Transition** - invoke planning skill

## REST Conventions

- Resource names: plural, lowercase, kebab-case (`/api/v1/order-items`)
- Nest only one level deep (`/users/{id}/orders`, not `/users/{id}/orders/{id}/items`)
- PATCH for partial updates, PUT for full replacements
- Filter via query params (`?status=active&role=admin`)
- Sort via `?sort=field` or `?sort=-field` for descending
- Include related resources via `?include=author,comments`

## GraphQL Conventions

- One query per view, fragments for shared fields
- Mutations return the modified entity
- Input types for create/update, separate from entity types
- Cursor-based pagination with `Connection` types
- Deprecate fields with `@deprecated` directive, not removal

## Error Design

```
{
  "error": {
    "code": "VALIDATION_FAILED",
    "message": "Email is required",
    "details": [{ "field": "email", "rule": "required" }]
  }
}
```

- Never leak stack traces or internal IDs in errors
- Use consistent error codes (UPPER_SNAKE_CASE)
- 422 for validation errors, not 400
- 409 for conflicts (duplicate, concurrent modification)

## Rules

- Check `.lex/pages/patterns.md` for existing API conventions
- Follow existing auth pattern (JWT, session, API key)
- Document every endpoint: method, path, request body, response, errors
- Name things for the consumer, not the database
- One endpoint does one thing. No multiplexed endpoints
