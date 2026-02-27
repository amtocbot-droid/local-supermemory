export const MEMORY_CATEGORIES = [
  "preference",
  "fact",
  "task",
  "reminder",
  "note",
  "project",
  "person",
  "place",
  "event",
  "other",
] as const;

export function detectCategory(text: string): string {
  const lower = text.toLowerCase();
  
  if (/prefer|like|favorite|usually|always|never|my (?:default|setting)/.test(lower)) {
    return "preference";
  }
  if (/remember (?:that|to)|don'?t forget|reminder/.test(lower)) {
    return "reminder";
  }
  if (/task|todo|need to|should|must|have to/.test(lower)) {
    return "task";
  }
  if (/project|working on|building|developing/.test(lower)) {
    return "project";
  }
  if (/\b(?:he|she|they|person|people|contact)\b/.test(lower)) {
    return "person";
  }
  if (/\b(?:at|in|near|location|address|place)\b/.test(lower)) {
    return "place";
  }
  if (/\b(?:meeting|event|appointment|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(lower)) {
    return "event";
  }
  return "note";
}

export function buildDocumentId(sessionKey: string): string {
  return `session_${sessionKey}_${Date.now()}`;
}