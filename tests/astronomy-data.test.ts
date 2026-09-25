import assert from "node:assert/strict";
import test from "node:test";
import { DateTime } from "luxon";
import { CITIES, type Place } from "../data/cities";
import { findSharedMoonWindow, formatLocal, haversineKm, moonPosition } from "../lib/astronomy";

function city(id: string) {
  const match = CITIES.find((place) => place.id === id);
  assert.ok(match, `Missing fixture city: ${id}`);
  return match;
}

function assertResultIsSane(a: Place, b: Place, date: string) {
  const result = findSharedMoonWindow(a, b, date);
  assert.ok(result.start instanceof Date && !Number.isNaN(result.start.getTime()));
  assert.ok(result.best instanceof Date && !Number.isNaN(result.best.getTime()));
  assert.ok(result.end instanceof Date && !Number.isNaN(result.end.getTime()));
  assert.ok(result.end >= result.start, `${a.name}/${b.name}: window ends before it starts`);
  assert.ok(result.illumination >= 0 && result.illumination <= 1);
  assert.ok(result.phase >= 0 && result.phase <= 1);
  assert.ok(Number.isFinite(result.altitudeA) && Number.isFinite(result.altitudeB));
  assert.ok(Number.isFinite(result.azimuthA) && Number.isFinite(result.azimuthB));
  assert.ok(result.distanceKm >= 0 && Number.isFinite(result.distanceKm));
  assert.match(formatLocal(result.start, a, true), /^\d{2}月\d{2}日 \d{2}:\d{2}$/);
  assert.match(formatLocal(result.start, b, true), /^\d{2}月\d{2}日 \d{2}:\d{2}$/);
  if (result.kind === "relay") {
    assert.ok(result.relay, `${a.name}/${b.name}: relay result is missing passage data`);
    assert.ok(result.relay.arrival > result.relay.departure);
  }
  return result;
}

test("同城结果距离为零，并且存在共同观测窗口", () => {
  const beijing = city("beijing");
  const result = assertResultIsSane(beijing, beijing, "2026-09-25");
  assert.equal(result.kind, "shared");
  assert.ok(result.distanceKm < 0.01);
});

test("广州与杭州优先返回所选日期的当晚，不再固定为 00:00", () => {
  const guangzhou = city("guangzhou");
  const hangzhou = city("hangzhou");
  const result = assertResultIsSane(guangzhou, hangzhou, "2026-09-25");
  assert.equal(result.kind, "shared");
  const localHour = DateTime.fromJSDate(result.best).setZone(guangzhou.timezone).hour;
  assert.ok(localHour >= 18 || localHour < 4, `Expected an evening observation, got ${localHour}:00`);
  assert.notEqual(formatLocal(result.best, guangzhou), "00:00");
});

test("跨时区与南北半球城市组合都能返回有效结果", () => {
  const fixtures: Array<[string, string, string]> = [
    ["newyork", "shanghai", "2026-09-25"],
    ["auckland", "hangzhou", "2026-09-25"],
    ["london", "sydney", "2026-12-21"],
  ];
  fixtures.forEach(([from, to, date]) => assertResultIsSane(city(from), city(to), date));
});

test("洛杉矶与迪拜没有共同窗口时，会返回月亮接力的真实月落与月升", () => {
  const result = assertResultIsSane(city("losangeles"), city("dubai"), "2026-09-25");
  assert.equal(result.kind, "relay");
  assert.ok(result.relay);
  assert.equal(result.relay.first, "a");
  assert.ok(result.relay.arrival.getTime() - result.relay.departure.getTime() < 24 * 60 * 60 * 1000);
});

test("跨日期变更线的地点依然使用各自的当地日期", () => {
  const kiritimati: Place = { id: "kiritimati", name: "圣诞岛", englishName: "Kiritimati", country: "基里巴斯", latitude: 1.8721, longitude: -157.4278, timezone: "Pacific/Kiritimati", aliases: "" };
  const honolulu: Place = { id: "honolulu", name: "檀香山", englishName: "Honolulu", country: "美国", latitude: 21.3099, longitude: -157.8581, timezone: "Pacific/Honolulu", aliases: "" };
  const result = assertResultIsSane(kiritimati, honolulu, "2026-09-25");
  assert.ok(haversineKm(kiritimati, honolulu) > 2000);
  assert.notEqual(formatLocal(result.best, kiritimati, true).slice(0, 5), formatLocal(result.best, honolulu, true).slice(0, 5));
});

test("夏令时跳转日不会产生不存在的纽约 02 时", () => {
  const newYork = city("newyork");
  const before = new Date("2026-03-08T06:30:00Z");
  const after = new Date("2026-03-08T07:30:00Z");
  assert.equal(formatLocal(before, newYork, true), "03月08日 01:30");
  assert.equal(formatLocal(after, newYork, true), "03月08日 03:30");
});

test("月亮位置始终以角度返回合理范围", () => {
  const position = moonPosition(city("hangzhou"), new Date("2026-09-25T12:00:00Z"));
  assert.ok(position.altitude >= -90 && position.altitude <= 90);
  assert.ok(position.azimuth >= -180 && position.azimuth <= 180);
});
