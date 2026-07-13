---
name: database-architecture
description: Database design as an architect - right-size tables for the workload. Use when designing schemas, creating migrations, or planning data models. Forces read-pattern-first reasoning and tradeoff analysis before any table creation.
---

# Database Architecture

Design databases like an architect, not a textbook. Right-size for the
workload: wide tables for read-heavy data that's always fetched together,
normalized tables for write-heavy data with independent lifecycles. Don't
dogmatically normalize OR denormalize - pick based on the actual query patterns.

<HARD-GATE>
Before creating ANY table, you must answer in writing:
1. What read pattern does this table serve? (write the query)
2. What write pattern updates this data? (how often, which fields together)
3. Why can these columns NOT live on an existing table?
4. What is the cardinality? (1-to-1, 1-to-few, 1-to-many unbounded)

If you cannot answer all four, you are not designing - you are guessing.
</HARD-GATE>

## Before You Design - Use the Index

```
node bin/lex.js schema              # see existing tables, columns, foreign keys
node bin/lex.js search "CREATE TABLE"  # find all table definitions in the codebase
node bin/lex.js search "SELECT"     # find existing query patterns to inform schema
node bin/lex.js links /api/         # see which routes consume which data
```

Do NOT design in a vacuum. The existing schema and query patterns tell you what the app actually needs. Search first, design second.

## Red Flags - Stop If You Think This

| Thought | Reality |
|---|---|
| "I'll normalize to 3NF" | 3NF is a textbook answer, not a production answer |
| "Small tables are cleaner" | 15 tables joined to render one page is not clean |
| "I can always join them later" | Joins at scale are the #1 performance killer |
| "Foreign keys keep it organized" | FKs enforce integrity, not performance. They add join overhead |
| "I'll add an index to fix the join" | An index on a join is a band-aid. The join shouldn't exist |
| "Always denormalize" | Over-wide tables cause write amplification and lock contention |
| "One big table is simpler" | A 200-column table that's partially written is not simpler |
| "I need a separate table for cleanliness" | Cleanliness is not a performance metric. Query speed is |

## Read vs Write Tradeoff - The Core Decision

There is no universal answer. The right design depends on the **read/write ratio**
and **which fields are written together vs read together**.

### When to go wide (denormalize)
- **Read-heavy** (>10:1 read/write ratio): denormalize hot fields. The join costs more than the duplication.
- **Fields always read together**: if every API response includes `order.customer_name`, put `customer_name` on the orders table.
- **Bounded relationships** (1-to-1, 1-to-few): columns or JSON, not a separate table.
- **Low write contention**: if the denormalized fields rarely change, duplication cost is near zero.

### When to normalize (split)
- **Write-heavy** or **balanced read/write**: separate tables avoid updating duplicated data everywhere.
- **Fields written independently**: if `user.bio` updates frequently but `user.email` doesn't, splitting reduces lock contention.
- **Unbounded 1-to-many**: a user has unlimited posts. You can't make posts columns on users.
- **Different lifecycles**: orders persist forever, order_items deleted with the order.
- **Data rarely read with parent**: if you almost never need `user.login_history` when reading a user, keep it separate.
- **Row width exceeds page size** (~8KB): split least-accessed columns to a side table.

### The key insight
Denormalization duplicates **write work** to save **read work**. If writes are
rare and reads are frequent, that's a good trade. If writes are frequent, you're
paying the duplication cost on every write for a read benefit you may not need.

## Decision Tree - Must Follow Top to Bottom

```
Creating a table? Answer these IN ORDER:

1. Is it 1-to-1 with an existing table?
   YES -> Add columns to the existing table. STOP. Do not create a table.
   NO  -> continue

2. Is it 1-to-few (bounded, max ~5)?
   YES -> Add columns to the parent (address1, address2, address3).
          Or use a JSON column. STOP. Do not create a table.
   NO  -> continue

3. Is it 1-to-many UNBOUNDED?
   YES -> This justifies a separate table. Continue to step 4.
   NO  -> continue

3b. Is the data write-heavy or balanced read/write?
   YES -> Lean toward a separate table to avoid write amplification.
   NO  -> Lean toward wide table (read-heavy = denormalize).

4. Does it have a different lifecycle than its parent?
   (e.g. orders persist, order_items are deleted with the order)
   YES -> Separate table is correct. Continue to step 5.
   NO  -> Strongly consider JSON column on parent instead.

5. Is the data rarely read with its parent?
   YES -> Separate table reduces overhead on parent reads. OK.
   NO  -> Denormalize the hot fields onto the parent. Keep the
          separate table only for the full dataset.

6. Would a single row exceed ~8KB?
   YES -> Split least-accessed columns to a side table.
   NO  -> One wide table.
```

## Design Process - Step by Step

1. **Query the index** - run `lex schema` and `lex search "SELECT"` to understand existing patterns
2. **List read patterns** - what queries will run? What fields does each need?
3. **List write patterns** - what updates will run? How often? Which fields change together vs independently?
4. **Determine read/write ratio** - read-heavy leans wide, write-heavy leans split
5. **Group by access pattern** - fields always read AND written together go on the same table
6. **Start with the right size** - wide for read-heavy, normalized for write-heavy. Don't force one approach.
7. **Walk the decision tree** - for each proposed table split, follow the tree above
8. **Denormalize hot read fields** - copy `customer_name` to `orders` IF customer_name is rarely updated
9. **Index filter columns** - index what's in WHERE clauses, not SELECT
10. **Use JSON for semi-structured** - tags, metadata, settings = JSON/JSONB column, not a separate table
11. **Run `lex guard`** - confirms no anti-patterns were introduced

## Stack-Specific Patterns

### PostgreSQL
- Use `JSONB` (not `JSON`) for semi-structured data - binary, indexable, faster
- `CREATE INDEX ON items USING GIN (metadata jsonb_path_ops)` for JSON key queries
- `GENERATED ALWAYS AS` columns for computed values instead of app-side calculation
- Partial indexes: `CREATE INDEX ... WHERE active = true` for common filter combos

### MySQL
- Use `JSON` column type for semi-structured data
- `JSON_EXTRACT(col, '$.key')` and generated columns for indexing JSON fields
- `STORED` generated columns can be indexed directly
- Avoid `ENUM` - use `VARCHAR` with app-level validation (ENUM migrations are painful)

### SQLite
- Use `TEXT` columns with `json_extract()` for JSON data
- No native JSON column type but supports JSON functions
- Keep schemas simple - SQLite is for embedded/single-server use cases
- `WITHOUT ROWID` for tables with natural primary keys (saves space)

### Laravel Migrations
- `$table->jsonb('metadata')->nullable()` for Postgres JSONB
- `$table->json('metadata')->nullable()` for MySQL JSON
- Use `$table->string('status')->default('active')` not `$table->enum()`
- Denormalize: `$table->string('customer_name')` on orders table, not just a FK to customers

## Rules

- NEVER create a 1-to-1 table. Put the columns on the parent table.
- NEVER create a table for bounded (1-to-few) relationships. Use columns or JSON.
- NEVER create a join table for a relationship that could be a JSON column.
- NEVER use EAV (entity-attribute-value). Unbounded joins AND no type safety.
- NEVER create a `*_settings` table with key-value pairs. Use a JSON column on the parent.
- NEVER create a `*_profiles` table when every entity has exactly one profile. Merge it.
- NEVER dogmatically denormalize. Check the read/write ratio first.
- NEVER create a 200-column table for write-heavy data. Write amplification will hurt.
- ALWAYS list read AND write patterns before designing the schema.
- ALWAYS denormalize fields that are read together AND rarely written separately.
- ALWAYS normalize when writes are frequent and fields update independently.
- ALWAYS index columns in WHERE clauses, not SELECT.
- ALWAYS use JSON/JSONB columns for variable-structure data instead of EAV tables.
- ALWAYS run `lex schema` before designing to see what already exists.
- ALWAYS run `lex guard` after creating migrations to catch anti-patterns.

## Migration Patterns

When refactoring an over-normalized schema to wide tables:

1. Add new columns to the target table (nullable first)
2. Backfill from joined tables in batches (10k rows at a time)
3. Switch reads to use the new columns (deploy)
4. Switch writes to populate the new columns (deploy)
5. Backfill any remaining rows
6. Make columns NOT NULL if needed
7. Drop old tables only after confirming no reads/writes use them

Never do a big-bang migration. Always batch, always have a fallback.

## Guard Integration

`lex guard` automatically detects these DB anti-patterns in your code:

- `*_profiles` table creation (1-to-1 anti-pattern)
- `*_settings` table with key-value pairs (EAV anti-pattern)
- EAV pattern: columns named `key`/`value` or `name`/`attribute`

Fix these before committing. The pre-commit hook will block commits with CRITICAL violations.
