import test from "node:test";
import assert from "node:assert/strict";
import {
  jsonFormat,
  toBase64,
  fromBase64,
  codec,
  jwtDecode,
  timestampToDate,
  dateToTimestamp,
  generateRandom,
  randomString,
  digest,
  textTransform,
  yamlConvert,
  sqlFormat,
  cronNext,
  cronDescribe,
} from "../src/lib.js";
test("JSON preserves large integers and decimal precision", () => {
  const s = '{"id":900719925474099312345,"amount":0.12345678901234567890}';
  assert.equal(jsonFormat(s, true), s);
  assert.throws(() => jsonFormat("{bad}"));
  assert.throws(() => jsonFormat('{"a":1,"a":2}'));
});
test("UTF-8 Base64 round trip includes Chinese and emoji", () => {
  const s = "你好 DoubleDB 👋";
  assert.equal(fromBase64(toBase64(s)), s);
  assert.throws(() => fromBase64("%%%"));
  assert.throws(() => fromBase64("/w=="));
});
test("URL and Unicode preserve special characters", () => {
  const s = "你好 😀 & + / ?";
  for (const type of ["url", "unicode"])
    assert.equal(codec(codec(s, type, "encode"), type, "decode"), s);
  assert.equal(codec("\\u{1f600}", "unicode", "decode"), "😀");
  assert.throws(() => codec("%zz", "url", "decode"));
});
test("JWT rejects malformed input and reports expiry without verification", () => {
  const h = toBase64('{"alg":"none"}'),
    p = toBase64('{"sub":"test","exp":1}');
  assert.equal(jwtDecode(`${h}.${p}.`).expired, true);
  assert.throws(() => jwtDecode("abc"));
});
test("timestamps support epoch, negative, seconds, milliseconds and UTC", () => {
  assert.equal(+timestampToDate("0", "s"), 0);
  assert.equal(+timestampToDate("-1", "s"), -1000);
  assert.equal(+timestampToDate("1234", "ms"), 1234);
  assert.equal(+dateToTimestamp("1970-01-01T00:00:00", "utc"), 0);
  assert.throws(() => timestampToDate("abc", "s"));
  assert.throws(() => timestampToDate("999999999999999999", "s"));
});
test("random generators respect bounds, alphabet and UUID format", () => {
  assert.equal(Array.from(randomString(20, "😀🚀")).length, 20);
  const s = randomString(100, "abc");
  assert.match(s, /^[abc]{100}$/);
  const ids = generateRandom("uuid", 10, 0, "").split("\n");
  assert.equal(new Set(ids).size, 10);
  assert.match(
    ids[0],
    /^[\da-f]{8}-[\da-f]{4}-4[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/,
  );
  assert.throws(() => generateRandom("uuid", 101, 0, ""));
  assert.throws(() => randomString(0, "abc"));
});
test("SHA-256 and HMAC match known cryptographic vectors", async () => {
  assert.equal(
    await digest("abc", "SHA-256"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(
    await digest(
      "The quick brown fox jumps over the lazy dog",
      "SHA-256",
      "key",
    ),
    "f7bc83f430538424b13298e6aa6fb143ef4d59a14946175997479dbc2d1a3cd8",
  );
  assert.equal((await digest("abc", "SHA-512")).length, 128);
});
test("text utilities handle CRLF, acronyms and numbers", () => {
  assert.equal(textTransform("a\r\na\r\nb", "dedupe"), "a\nb");
  assert.equal(textTransform("HTTPServerName", "snake"), "http_server_name");
  assert.equal(textTransform("hello_world", "camel"), "helloWorld");
  assert.equal(textTransform("10\n2", "sort"), "2\n10");
});
test("YAML conversion preserves integers and rejects duplicate keys", () => {
  assert.match(
    yamlConvert("id: 900719925474099312345\nname: test", "toJson"),
    /900719925474099312345/,
  );
  assert.match(
    yamlConvert('{"id":900719925474099312345}', "toYaml"),
    /900719925474099312345/,
  );
  assert.throws(() => yamlConvert("a: 1\na: 2", "toJson"));
  assert.throws(() => yamlConvert("a: [", "toJson"));
});
test("SQL handles quoted whitespace and comments in compact layout", () => {
  for (const language of [
    "sql",
    "mysql",
    "postgresql",
    "sqlite",
    "transactsql",
    "plsql",
  ]) {
    const out = sqlFormat(
      "select 'a  b' as x; -- note\nselect 2;",
      language,
      true,
    );
    assert.ok(out.includes("'a  b'"));
    assert.ok(out.includes("-- note\n"));
  }
});
test("Cron uses timezone and excludes weekends", () => {
  const dates = cronNext(
    "0 9 * * 1-5",
    "Asia/Shanghai",
    new Date("2026-09-25T02:00:00Z"),
  );
  assert.equal(dates[0].toISOString(), "2026-09-28T01:00:00.000Z");
  assert.equal(dates.length, 8);
  assert.equal(cronDescribe("*/5 * * * *")[0].description, "每 5 个单位");
  assert.throws(() => cronNext("* *"));
  assert.throws(() => cronNext("80 * * * *"));
});
