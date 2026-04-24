import { API_BASE } from "../lib/utils.js";

export async function requestJson(path, {
  baseUrl = API_BASE,
  body,
  headers,
  method = "GET",
  publicRequest = false,
  token,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(publicRequest || !token ? {} : { Authorization: `Bearer ${token}` }),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  const text = await response.text();
  let data = null;

  if (text) {
    try {
      data = JSON.parse(text);
    } catch (error) {
      throw new Error(`Invalid JSON returned from ${path}`);
    }
  }

  if (!response.ok) {
    const detail = data?.detail || data?.error || response.statusText;
    throw new Error(detail);
  }

  return data;
}

export async function requestStream(path, {
  baseUrl = API_BASE,
  body,
  headers,
  method = "POST",
  onEvent,
  token,
} = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(headers || {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(text || response.statusText);
  }

  if (!response.body) {
    throw new Error("Streaming is not supported in this browser.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() || "";

    chunks.forEach((chunk) => {
      const line = chunk
        .split("\n")
        .find((entry) => entry.startsWith("data: "));
      if (!line) {
        return;
      }
      const payload = JSON.parse(line.slice(6));
      onEvent?.(payload);
    });
  }
}
