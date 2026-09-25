import { DateTime } from "luxon";
import * as SunCalc from "suncalc";
import type { Place } from "@/data/cities";

const STEP_MS = 5 * 60 * 1000;

export type SharedMoonResult = {
  kind: "shared" | "relay";
  start: Date;
  best: Date;
  end: Date;
  distanceKm: number;
  illumination: number;
  phase: number;
  altitudeA: number;
  altitudeB: number;
  azimuthA: number;
  azimuthB: number;
  skyLabel: "两地皆是夜晚" | "至少一地是夜晚" | "月亮同时在天空";
  relay: {
    first: "a" | "b";
    departure: Date;
    arrival: Date;
  } | null;
};

function altitude(place: Place, date: Date) {
  return SunCalc.getMoonPosition(date, place.latitude, place.longitude).altitude;
}

export function moonPosition(place: Place, date: Date) {
  const position = SunCalc.getMoonPosition(date, place.latitude, place.longitude);
  return {
    altitude: position.altitude,
    azimuth: position.azimuth,
  };
}

function isVisible(a: Place, b: Place, date: Date, threshold = 2) {
  return altitude(a, date) > threshold && altitude(b, date) > threshold;
}

function isAboveHorizon(place: Place, date: Date, threshold = 2) {
  return altitude(place, date) > threshold;
}

function refinePlaceBoundary(place: Place, before: Date, after: Date, targetAbove: boolean) {
  let low = before.getTime();
  let high = after.getTime();
  for (let i = 0; i < 10; i += 1) {
    const mid = Math.round((low + high) / 2);
    if (isAboveHorizon(place, new Date(mid)) === targetAbove) high = mid;
    else low = mid;
  }
  return new Date(high);
}

function findRelayPassage(a: Place, b: Place, rangeStart: number) {
  const scanStart = rangeStart - 12 * 60 * 60 * 1000;
  const scanEnd = rangeStart + 60 * 60 * 60 * 1000;
  const transitions = (place: Place) => {
    const rises: Date[] = [];
    const sets: Date[] = [];
    let previousDate = new Date(scanStart);
    let previousAbove = isAboveHorizon(place, previousDate);
    for (let time = scanStart + STEP_MS; time <= scanEnd; time += STEP_MS) {
      const date = new Date(time);
      const above = isAboveHorizon(place, date);
      if (!previousAbove && above) rises.push(refinePlaceBoundary(place, previousDate, date, true));
      if (previousAbove && !above) sets.push(refinePlaceBoundary(place, previousDate, date, false));
      previousDate = date;
      previousAbove = above;
    }
    return { rises, sets };
  };
  const aEvents = transitions(a);
  const bEvents = transitions(b);
  const candidates: Array<{ first: "a" | "b"; departure: Date; arrival: Date }> = [];
  for (const departure of aEvents.sets) {
    const arrival = bEvents.rises.find((rise) => rise > departure);
    if (arrival) candidates.push({ first: "a", departure, arrival });
  }
  for (const departure of bEvents.sets) {
    const arrival = aEvents.rises.find((rise) => rise > departure);
    if (arrival) candidates.push({ first: "b", departure, arrival });
  }
  return candidates
    .filter((candidate) => candidate.departure.getTime() >= rangeStart
      && candidate.departure.getTime() <= rangeStart + 36 * 60 * 60 * 1000
      && candidate.arrival.getTime() - candidate.departure.getTime() <= 36 * 60 * 60 * 1000)
    .sort((one, two) => (one.arrival.getTime() - one.departure.getTime()) - (two.arrival.getTime() - two.departure.getTime()))[0] ?? null;
}

function refineBoundary(a: Place, b: Place, before: Date, after: Date, targetVisible: boolean) {
  let low = before.getTime();
  let high = after.getTime();
  for (let i = 0; i < 10; i += 1) {
    const mid = Math.round((low + high) / 2);
    if (isVisible(a, b, new Date(mid)) === targetVisible) high = mid;
    else low = mid;
  }
  return new Date(high);
}

function skyLabel(a: Place, b: Place, date: Date): SharedMoonResult["skyLabel"] {
  const sunA = SunCalc.getPosition(date, a.latitude, a.longitude).altitude;
  const sunB = SunCalc.getPosition(date, b.latitude, b.longitude).altitude;
  const civilTwilight = -6;
  if (sunA < civilTwilight && sunB < civilTwilight) return "两地皆是夜晚";
  if (sunA < 0 || sunB < 0) return "至少一地是夜晚";
  return "月亮同时在天空";
}

function preferredObservationStart(a: Place, b: Place, window: { start: Date; end: Date }) {
  const civilTwilight = -6;
  const firstWithSky = (predicate: (sunA: number, sunB: number) => boolean) => {
    for (let time = window.start.getTime(); time <= window.end.getTime(); time += STEP_MS) {
      const date = new Date(time);
      const sunA = SunCalc.getPosition(date, a.latitude, a.longitude).altitude;
      const sunB = SunCalc.getPosition(date, b.latitude, b.longitude).altitude;
      if (predicate(sunA, sunB)) return date;
    }
    return null;
  };

  return firstWithSky((sunA, sunB) => sunA < civilTwilight && sunB < civilTwilight)
    ?? firstWithSky((sunA, sunB) => sunA < 0 && sunB < 0)
    ?? firstWithSky((sunA, sunB) => sunA < 0 || sunB < 0)
    ?? window.start;
}

function bestSharedObservation(a: Place, b: Place, start: Date, end: Date) {
  let best = start;
  let bestScore = Math.min(altitude(a, start), altitude(b, start));
  for (let time = start.getTime() + STEP_MS; time <= end.getTime(); time += STEP_MS) {
    const date = new Date(time);
    const score = Math.min(altitude(a, date), altitude(b, date));
    if (score > bestScore) {
      best = date;
      bestScore = score;
    }
  }
  return best;
}

export function haversineKm(a: Place, b: Place) {
  const radius = 6371;
  const toRad = (value: number) => value * Math.PI / 180;
  const dLat = toRad(b.latitude - a.latitude);
  const dLon = toRad(b.longitude - a.longitude);
  const lat1 = toRad(a.latitude);
  const lat2 = toRad(b.latitude);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return radius * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

export function findSharedMoonWindow(a: Place, b: Place, localDateAtA: string): SharedMoonResult {
  const localStart = DateTime.fromISO(localDateAtA, { zone: a.timezone }).startOf("day");
  const rangeStart = localStart.toUTC().toMillis();
  const rangeEnd = rangeStart + 36 * 60 * 60 * 1000;
  const windows: Array<{ start: Date; end: Date }> = [];
  let activeStart: Date | null = null;
  let previousDate = new Date(rangeStart);
  let previousVisible = isVisible(a, b, previousDate);
  if (previousVisible) activeStart = previousDate;

  for (let time = rangeStart + STEP_MS; time <= rangeEnd; time += STEP_MS) {
    const date = new Date(time);
    const visible = isVisible(a, b, date);
    if (!previousVisible && visible) activeStart = refineBoundary(a, b, previousDate, date, true);
    if (previousVisible && !visible && activeStart) {
      const end = refineBoundary(a, b, previousDate, date, false);
      if (end.getTime() - activeStart.getTime() >= 15 * 60 * 1000) windows.push({ start: activeStart, end });
      activeStart = null;
    }
    previousDate = date;
    previousVisible = visible;
  }

  if (activeStart) windows.push({ start: activeStart, end: new Date(rangeEnd) });

  const preferredEveningStart = localStart.plus({ hours: 18 }).toUTC().toMillis();
  const preferredEveningEnd = localStart.plus({ days: 1, hours: 4 }).toUTC().toMillis();
  const ranked = windows.sort((one, two) => {
    const eveningRank = (window: { start: Date; end: Date }) => (
      window.end.getTime() > preferredEveningStart && window.start.getTime() < preferredEveningEnd ? 0 : 1
    );
    const rank = (window: { start: Date; end: Date }) => {
      const mid = new Date((window.start.getTime() + window.end.getTime()) / 2);
      const label = skyLabel(a, b, mid);
      return label === "两地皆是夜晚" ? 0 : label === "至少一地是夜晚" ? 1 : 2;
    };
    return eveningRank(one) - eveningRank(two)
      || rank(one) - rank(two)
      || one.start.getTime() - two.start.getTime();
  });

  const chosen = ranked[0];
  const relay = chosen ? null : findRelayPassage(a, b, rangeStart);
  const fallbackStart = new Date(rangeStart + 18 * 60 * 60 * 1000);
  const fallbackEnd = new Date(fallbackStart.getTime() + 90 * 60 * 1000);
  const start = chosen ? preferredObservationStart(a, b, chosen) : fallbackStart;
  const end = chosen?.end ?? fallbackEnd;
  const best = chosen ? bestSharedObservation(a, b, start, end) : relay?.arrival ?? fallbackEnd;
  const moonA = SunCalc.getMoonPosition(best, a.latitude, a.longitude);
  const moonB = SunCalc.getMoonPosition(best, b.latitude, b.longitude);
  const illumination = SunCalc.getMoonIllumination(best);

  return {
    kind: chosen ? "shared" : "relay",
    start,
    best,
    end,
    distanceKm: haversineKm(a, b),
    illumination: illumination.fraction,
    phase: illumination.phase,
    altitudeA: moonA.altitude,
    altitudeB: moonB.altitude,
    azimuthA: moonA.azimuth,
    azimuthB: moonB.azimuth,
    skyLabel: skyLabel(a, b, best),
    relay,
  };
}

export function formatLocal(date: Date, place: Place, includeDate = false) {
  return DateTime.fromJSDate(date).setZone(place.timezone).toFormat(includeDate ? "MM月dd日 HH:mm" : "HH:mm");
}

export function formatDuration(start: Date, end: Date) {
  const minutes = Math.max(0, Math.round((end.getTime() - start.getTime()) / 60000));
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours} 小时 ${rest} 分钟` : `${rest} 分钟`;
}
