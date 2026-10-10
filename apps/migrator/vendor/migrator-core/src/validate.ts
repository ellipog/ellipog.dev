/**
 * Validation: every emitted file against the Tenet schemas it must satisfy.
 *
 * <h2>Why a vendored validator instead of a dependency</h2>
 *
 * The core runs dependency-free (browser Workers included), so the JSON-Schema subset below
 * is hand-rolled against exactly the keywords Tenet's five schemas use — nothing more.
 * Unknown keywords are ignored per the specification, and any keyword the schemas grow into
 * that this validator does not understand fails the drift test loudly by being listed in
 * {@link KNOWN_KEYWORDS} review, not by silently passing.
 *
 * The schemas themselves are vendored copies of Tenet's own (`src/schemas/`), stamped with
 * the Tenet commit they came from. A test refuses drift: if Tenet's schemas change without
 * re-vendoring, the suite fails naming the files, and re-vendoring means consciously
 * re-reading what changed.
 *
 * A schema violation is an error, never a warning: it names a file Tenet would refuse. The
 * mappers construct every object from validated parts, so a violation here means a mapper
 * bug or schema drift — both stop the run.
 */

import chapterSchema from "./schemas/chapter.schema.json";
import groupSchema from "./schemas/group.schema.json";
import indexSchema from "./schemas/index.schema.json";
import questSchema from "./schemas/quest.schema.json";
import rewardTableSchema from "./schemas/reward_table.schema.json";
import { Report } from "./report";

export const SCHEMA_STAMP = {
  tenetCommit: "d8258f4",
  vendored: "2026-10-10",
  files: [
    "index.schema.json",
    "group.schema.json",
    "chapter.schema.json",
    "quest.schema.json",
    "reward_table.schema.json",
  ],
};

type Json = unknown;
type Schema = Record<string, Json>;

export interface SchemaIssue {
  readonly at: string;
  readonly message: string;
}

const KNOWN_KEYWORDS: ReadonlySet<string> = new Set([
  "$id",
  "$ref",
  "$schema",
  "additionalProperties",
  "allOf",
  "anyOf",
  "const",
  "default",
  "definitions",
  "description",
  "enum",
  "items",
  "maxItems",
  "maxProperties",
  "maximum",
  "minItems",
  "minProperties",
  "minimum",
  "not",
  "oneOf",
  "pattern",
  "properties",
  "propertyNames",
  "required",
  "title",
  "type",
]);

/** Every keyword a schema uses that this validator does not implement. */
export function unknownKeywords(schema: Schema): Array<string> {
  const applicators = new Set([
    "if",
    "then",
    "else",
    "patternProperties",
    "contains",
    "dependentSchemas",
    "dependentRequired",
    "unevaluatedProperties",
    "unevaluatedItems",
    "prefixItems",
    "propertyDependencies",
  ]);
  const found = new Set<string>();
  const walk = (node: Json): void => {
    if (Array.isArray(node)) {
      for (const item of node) {
        walk(item);
      }
      return;
    }
    if (node !== null && typeof node === "object") {
      for (const [key, value] of Object.entries(node)) {
        if (applicators.has(key)) {
          found.add(key);
        }
        walk(value);
      }
    }
  };
  walk(schema);
  return [...found].sort();
}

export function validateAgainstSchema(value: Json, schema: Schema, root: Schema): Array<SchemaIssue> {
  return checkNode(value, schema, root, root, "$");
}

function checkNode(value: Json, schema: Schema, root: Schema, base: Schema, at: string): Array<SchemaIssue> {
  const issues: Array<SchemaIssue> = [];
  if (schema["$ref"] !== undefined && typeof schema["$ref"] === "string") {
    const jump = resolveRef(schema["$ref"] as string, root, base);
    if (jump === null) {
      return [{ at, message: `unknown reference ${schema["$ref"] as string}` }];
    }
    issues.push(...checkNode(value, jump.schema, root, jump.base, at));
  }
  const allOf = schema["allOf"];
  if (Array.isArray(allOf)) {
    for (const sub of allOf) {
      if (isSchema(sub)) {
        issues.push(...checkNode(value, sub, root, base, at));
      }
    }
  }
  const anyOf = schema["anyOf"];
  if (Array.isArray(anyOf)) {
    const subs = anyOf.filter(isSchema);
    if (subs.length > 0 && !subs.some((sub) => checkNode(value, sub, root, base, at).length === 0)) {
      issues.push({ at, message: "matches none of the allowed shapes" });
    }
  }
  const oneOf = schema["oneOf"];
  if (Array.isArray(oneOf)) {
    const subs = oneOf.filter(isSchema);
    const matches = subs.filter((sub) => checkNode(value, sub, root, base, at).length === 0).length;
    if (matches !== 1) {
      issues.push({ at, message: `matches ${matches} of the allowed shapes, needs exactly one` });
    }
  }
  const not = schema["not"];
  if (isSchema(not) && checkNode(value, not, root, base, at).length === 0) {
    issues.push({ at, message: "matches a forbidden shape" });
  }
  if (schema["enum"] !== undefined && Array.isArray(schema["enum"])) {
    const allowed = schema["enum"] as Array<Json>;
    if (!allowed.some((option) => JSON.stringify(option) === JSON.stringify(value))) {
      issues.push({ at, message: `is not one of ${allowed.map((option) => JSON.stringify(option)).join(", ")}` });
    }
  }
  if (schema["const"] !== undefined) {
    if (JSON.stringify(schema["const"]) !== JSON.stringify(value)) {
      issues.push({ at, message: `is not ${JSON.stringify(schema["const"])}` });
    }
  }
  const type = schema["type"];
  if (typeof type === "string") {
    if (!checkType(value, type)) {
      issues.push({ at, message: `is ${kindOf(value)}, needs ${type}` });
      return issues;
    }
  } else if (Array.isArray(type)) {
    if (!type.some((option) => typeof option === "string" && checkType(value, option))) {
      issues.push({ at, message: `is ${kindOf(value)}, needs ${(type as Array<Json>).join(" or ")}` });
      return issues;
    }
  }
  // Applicators constrain whatever they match, with or without an explicit type: many
  // schema branches (like imageSource's oneOf arms) carry only required or properties.
  if (value !== null && typeof value === "object" && !Array.isArray(value)) {
    issues.push(...checkObject(value as Record<string, Json>, schema, root, base, at));
  } else if (Array.isArray(value)) {
    issues.push(...checkArray(value as Array<Json>, schema, root, base, at));
  } else if (typeof value === "string") {
    issues.push(...checkString(value as string, schema, at));
  } else if (typeof value === "number") {
    issues.push(...checkNumber(value as number, schema, at));
  }
  return issues;
}

function checkObject(
  value: Record<string, Json>,
  schema: Schema,
  root: Schema,
  base: Schema,
  at: string,
): Array<SchemaIssue> {
  const issues: Array<SchemaIssue> = [];
  const required = schema["required"];
  if (Array.isArray(required)) {
    for (const key of required) {
      if (typeof key === "string" && !(key in value)) {
        issues.push({ at, message: `is missing ${JSON.stringify(key)}` });
      }
    }
  }
  const properties = schema["properties"];
  const declared = properties !== null && typeof properties === "object" && !Array.isArray(properties)
    ? (properties as Record<string, Json>)
    : {};
  for (const [key, child] of Object.entries(value)) {
    const sub = declared[key];
    if (isSchema(sub)) {
      issues.push(...checkNode(child, sub, root, base, `${at}.${key}`));
    }
  }
  const additional = schema["additionalProperties"];
  if (additional === false) {
    for (const key of Object.keys(value)) {
      if (!(key in declared)) {
        issues.push({ at: `${at}.${key}`, message: "is not a known field" });
      }
    }
  } else if (isSchema(additional)) {
    for (const [key, child] of Object.entries(value)) {
      if (!(key in declared)) {
        issues.push(...checkNode(child, additional, root, base, `${at}.${key}`));
      }
    }
  }
  const names = schema["propertyNames"];
  if (isSchema(names)) {
    for (const key of Object.keys(value)) {
      issues.push(...checkNode(key, names, root, base, `${at} (name ${JSON.stringify(key)})`));
    }
  }
  for (const [bound, keyword] of [["minProperties", "minProperties"], ["maxProperties", "maxProperties"]] as const) {
    const limit = schema[keyword];
    if (typeof limit === "number") {
      const count = Object.keys(value).length;
      if (bound === "minProperties" && count < limit) {
        issues.push({ at, message: `holds ${count} fields, needs at least ${limit}` });
      }
      if (bound === "maxProperties" && count > limit) {
        issues.push({ at, message: `holds ${count} fields, allows at most ${limit}` });
      }
    }
  }
  return issues;
}

function checkArray(
  value: Array<Json>,
  schema: Schema,
  root: Schema,
  base: Schema,
  at: string,
): Array<SchemaIssue> {
  const issues: Array<SchemaIssue> = [];
  const minItems = schema["minItems"];
  if (typeof minItems === "number" && value.length < minItems) {
    issues.push({ at, message: `holds ${value.length} entries, needs at least ${minItems}` });
  }
  const maxItems = schema["maxItems"];
  if (typeof maxItems === "number" && value.length > maxItems) {
    issues.push({ at, message: `holds ${value.length} entries, allows at most ${maxItems}` });
  }
  const items = schema["items"];
  if (isSchema(items)) {
    value.forEach((item, index) => {
      issues.push(...checkNode(item, items, root, base, `${at}[${index}]`));
    });
  }
  return issues;
}

function checkString(value: string, schema: Schema, at: string): Array<SchemaIssue> {
  const issues: Array<SchemaIssue> = [];
  const pattern = schema["pattern"];
  if (typeof pattern === "string") {
    let test: RegExp | null = null;
    try {
      test = new RegExp(pattern);
    } catch {
      test = null;
    }
    if (test !== null && !test.test(value)) {
      issues.push({ at, message: `breaks the ${pattern} rule` });
    }
  }
  return issues;
}

function checkNumber(value: number, schema: Schema, at: string): Array<SchemaIssue> {
  const issues: Array<SchemaIssue> = [];
  const minimum = schema["minimum"];
  if (typeof minimum === "number" && value < minimum) {
    issues.push({ at, message: `${value} stands below ${minimum}` });
  }
  const maximum = schema["maximum"];
  if (typeof maximum === "number" && value > maximum) {
    issues.push({ at, message: `${value} stands above ${maximum}` });
  }
  return issues;
}

function checkType(value: Json, type: string): boolean {
  switch (type) {
    case "object":
      return value !== null && typeof value === "object" && !Array.isArray(value);
    case "array":
      return Array.isArray(value);
    case "string":
      return typeof value === "string";
    case "integer":
      return typeof value === "number" && Number.isInteger(value);
    case "number":
      return typeof value === "number";
    case "boolean":
      return typeof value === "boolean";
    case "null":
      return value === null;
    default:
      return false;
  }
}

function kindOf(value: Json): string {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "an array";
  }
  switch (typeof value) {
    case "object":
      return "an object";
    case "string":
      return "text";
    case "number":
      return Number.isInteger(value) ? "a whole number" : "a number";
    case "boolean":
      return "true or false";
    default:
      return typeof value;
  }
}

function isSchema(value: Json): value is Schema {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function resolveRef(ref: string, root: Schema, base: Schema): { schema: Schema; base: Schema } | null {
  void root;
  // Local references resolve against the document that holds them, which is the base the
  // walk carried in — not the file the walk started from.
  let schema = base;
  let path = ref;
  const cut = ref.indexOf("#/");
  if (cut > 0) {
    const file = ref.slice(0, cut);
    const leaf = file.split("/").pop() ?? file;
    const match = (Object.entries(SCHEMAS) as Array<[string, Schema]>).find(([name]) =>
      `${name}.schema.json` === leaf || (name === "rewardTable" && leaf === "reward_table.schema.json"),
    );
    if (match === undefined) {
      return null;
    }
    schema = match[1];
    path = ref.slice(cut + 1);
  } else if (!ref.startsWith("#/")) {
    return null;
  } else {
    path = ref.slice(1);
  }
  const parts = path.split("/").filter((part) => part.length > 0);
  let current: Json = schema;
  for (const part of parts) {
    if (current === null || typeof current !== "object" || Array.isArray(current)) {
      return null;
    }
    current = (current as Record<string, Json>)[part];
    if (current === undefined) {
      return null;
    }
  }
  if (!isSchema(current)) {
    return null;
  }
  return { schema: current, base: schema };
}

const SCHEMAS: Record<string, Schema> = {
  index: indexSchema as Schema,
  group: groupSchema as Schema,
  chapter: chapterSchema as Schema,
  quest: questSchema as Schema,
  rewardTable: rewardTableSchema as Schema,
};

export function schemaFor(path: string): { name: string; schema: Schema } | null {
  if (path === "index.json") {
    return { name: "index", schema: SCHEMAS["index"] as Schema };
  }
  if (path.endsWith("/group.json")) {
    return { name: "group", schema: SCHEMAS["group"] as Schema };
  }
  if (path.endsWith("/chapter.json")) {
    return { name: "chapter", schema: SCHEMAS["chapter"] as Schema };
  }
  if (path.startsWith("reward_tables/")) {
    return { name: "reward_table", schema: SCHEMAS["rewardTable"] as Schema };
  }
  if (path.startsWith("lang/") || path.startsWith("_migrator/")) {
    return null;
  }
  if (path.endsWith(".json")) {
    return { name: "quest", schema: SCHEMAS["quest"] as Schema };
  }
  return null;
}

export interface EmittedFile {
  readonly path: string;
  readonly text: string;
}

/**
 * Every emitted file against its Tenet schema, plus the lang overlays' flat shape.
 * Violations are errors: they name files Tenet would refuse. Returns the issue count.
 */
export function validateOutput(files: ReadonlyArray<EmittedFile>, report: Report): number {
  let count = 0;
  for (const file of files) {
    let parsed: Json = null;
    try {
      parsed = JSON.parse(file.text) as Json;
    } catch {
      report.error({
        code: "invalid-json",
        message: `${file.path} is not valid JSON`,
        path: file.path,
        line: 0,
      });
      count++;
      continue;
    }
    if (file.path.startsWith("lang/")) {
      count += checkLangOverlay(file.path, parsed, report);
      continue;
    }
    if (file.path.startsWith("_migrator/")) {
      continue;
    }
    const match = schemaFor(file.path);
    if (match === null) {
      continue;
    }
    for (const issue of validateAgainstSchema(parsed, match.schema, match.schema)) {
      report.error({
        code: "schema-violation",
        message: `${file.path} ${issue.at} ${issue.message}`,
        path: file.path,
        line: 0,
      });
      count++;
    }
  }
  return count;
}

function checkLangOverlay(path: string, parsed: Json, report: Report): number {
  // Tenet reads lang files as flat string maps; anything else is refused per value.
  if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
    report.error({ code: "schema-violation", message: `${path} is not a flat string map`, path, line: 0 });
    return 1;
  }
  let count = 0;
  for (const [key, value] of Object.entries(parsed as Record<string, Json>)) {
    if (typeof value !== "string") {
      report.error({
        code: "schema-violation",
        message: `${path} entry ${JSON.stringify(key)} is not text`,
        path,
        line: 0,
      });
      count++;
    }
  }
  return count;
}

/**
 * Capabilities: the profile converts FTB Quests format 13 to Tenet file version 1.
 * Anything else refuses with the versions named — converting a format the mappings were
 * never read against would be guessing.
 */
export function checkCapabilities(version: number | null, report: Report, path: string): boolean {
  if (version === null) {
    report.error({
      code: "unsupported-version",
      message: `the book names no format version; this profile converts format 13`,
      path,
      line: 0,
    });
    return false;
  }
  if (version !== 13) {
    report.error({
      code: "unsupported-version",
      message: `the book is format ${version}; this profile converts format 13`,
      path,
      line: 0,
      value: version,
    });
    return false;
  }
  return true;
}
