import type { UrlValue } from "./types";
const upper = (s: string) => s.replace(/%[\da-f]{2}/gi, (x) => x.toUpperCase());
function dots(path: string): string {
  let input = path,
    output = "";
  while (input) {
    if (input.startsWith("../")) input = input.slice(3);
    else if (input.startsWith("./")) input = input.slice(2);
    else if (input.startsWith("/./")) input = input.slice(2);
    else if (input === "/.") input = "/";
    else if (input.startsWith("/../")) {
      input = input.slice(3);
      output = output.replace(/\/?[^/]*$/, "");
    } else if (input === "/..") {
      input = "/";
      output = output.replace(/\/?[^/]*$/, "");
    } else if (input === "." || input === "..") input = "";
    else {
      const m = input.match(/^\/?[^/]*/)!;
      output += m[0];
      input = input.slice(m[0].length);
    }
  }
  return output;
}
export function normalize(original: string, base = ""): UrlValue {
  const result: UrlValue = { original, key: null, fragment: "", notes: [] };
  let v = original.trim();
  const fail = (error: string) => ({ ...result, error });
  if (v !== original) result.notes.push("URL_TRIM");
  if (!v) return fail("URL vide.");
  if (/[\u0000-\u0020\u007F\\]/.test(v))
    return fail("Espace intérieur, contrôle ou antislash interdit.");
  if (/[<>"`{}|^]/.test(v)) return fail("Caractère URI non échappé interdit.");
  if (/%(?![\da-f]{2})/i.test(v)) return fail("Encodage percent incomplet.");
  const hash = v.indexOf("#");
  if (hash >= 0) {
    result.fragment = v.slice(hash + 1);
    v = v.slice(0, hash);
    result.notes.push("URL_FRAGMENT");
  }
  if (!/^https?:\/\//i.test(v)) {
    if (/^[a-z][a-z\d+.-]*:/i.test(v))
      return fail("Seules les URL HTTP(S) sont admises.");
    const b = base ? normalize(base) : null;
    if (!b?.key || b.fragment)
      return fail("Référence relative : base HTTP(S) explicite requise.");
    const m = b.key.match(/^(https?:\/\/[^/]+)(\/[^?]*)(\?.*)?$/)!;
    if (v.startsWith("//")) v = m[1].split(":")[0] + ":" + v;
    else {
      const q = v.indexOf("?");
      const path = q < 0 ? v : v.slice(0, q);
      const query = q < 0 ? "" : v.slice(q);
      v =
        m[1] +
        (path
          ? dots(
              path.startsWith("/")
                ? path
                : m[2].slice(0, m[2].lastIndexOf("/") + 1) + path,
            )
          : m[2]) +
        (query || (!path ? (m[3] ?? "") : ""));
    }
    result.notes.push("URL_RELATIVE");
  }
  const m = v.match(/^(https?):\/\/([^/?#]+)([^?#]*)(\?[^#]*)?$/i);
  if (!m) return fail("URL HTTP(S) non reconnue.");
  const authority = m[2];
  if (authority.includes("@")) return fail("Identifiants intégrés interdits.");
  if (/[^\x21-\x7E]/.test(authority) || authority.includes("%"))
    return fail(
      "Hôte Unicode ou encodé ambigu : fournissez sa forme ASCII explicite.",
    );
  let u: URL;
  try {
    u = new URL(v);
  } catch {
    return fail("Hôte ou port invalide.");
  }
  if (u.username || u.password || !u.hostname) return fail("URL non admise.");
  const hostMatch = authority.match(/^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/);
  if (!hostMatch) return fail("Autorité invalide.");
  const scheme = m[1].toLowerCase();
  const rawHost = hostMatch[1].toLowerCase();
  if (rawHost !== u.hostname.toLowerCase())
    return fail(
      "Hôte ambigu ou sérialisation différente : utilisez un hôte explicite canonique.",
    );
  const port = hostMatch[2] ? Number(hostMatch[2]) : null;
  const host =
    rawHost +
    (port !== null &&
    !(
      (scheme === "http" && port === 80) ||
      (scheme === "https" && port === 443)
    )
      ? ":" + port
      : "");
  const path = m[3] || "/";
  if (/(?:^|\/)(?:\.|%2e){1,2}(?:\/|$)/i.test(path))
    result.notes.push("URL_DOT_SEGMENTS");
  if (/[^\x21-\x7E]/.test(path + (m[4] ?? "")))
    result.notes.push("URL_UNICODE");
  result.key = `${scheme}://${host}${upper(path)}${upper(m[4] ?? "")}`;
  if (result.key !== v) result.notes.push("URL_NORMALIZED");
  return result;
}
export function variants(key: string): string[] {
  const m = key.match(/^(https?):\/\/([^/]+)(\/[^?]*)(\?.*)?$/)!;
  return [
    key.replace(/^https?:/, m[1] === "http" ? "https:" : "http:"),
    `${m[1]}://${m[2].startsWith("www.") ? m[2].slice(4) : "www." + m[2]}${m[3]}${m[4] ?? ""}`,
    `${m[1]}://${m[2]}${m[3] === "/" ? "/" : m[3].endsWith("/") ? m[3].slice(0, -1) : m[3] + "/"}${m[4] ?? ""}`,
  ].filter((x) => x !== key);
}
