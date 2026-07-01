// src/ssrf-guard.js
//
// Proteção SSRF (SPEC seção 7, item 1). Como X-N8N-URL e URLs de webhook vêm
// do cliente, valida o host antes de qualquer fetch a esses alvos.
//
// Modos (env N8N_SSRF_MODE, default "moderate"):
//   - "off"      : desliga a checagem (permite tudo).
//   - "moderate" : bloqueia loopback e metadata de nuvem (169.254.169.254);
//                  PERMITE IP privado (muitos n8n self-hosted estão em rede interna).
//   - "strict"   : além do acima, bloqueia também IP privado (RFC1918) e link-local.
//
// Sem dependências novas: node:dns/promises + regex, sem pin de agente HTTP.
//
// Conectado em: execute_workflow_via_webhook (Task 2) e em toda chamada do
// cliente n8n via src/n8n-client.js — request()/rawRequest() (Task 8, item 1).

import dns from "node:dns/promises";

const VALID_MODES = new Set(["off", "moderate", "strict"]);
const METADATA_IP = "169.254.169.254";

/** Resolve o modo efetivo a partir de env, com fallback "moderate". */
export function resolveMode() {
    const m = (process.env.N8N_SSRF_MODE ?? "moderate").toLowerCase();
    return VALID_MODES.has(m) ? m : "moderate";
}

/** Divide um IPv4 em octetos numéricos, ou null se não for IPv4 válido. */
function ipv4Octets(ip) {
    const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(ip);
    if (!m) return null;
    const octets = m.slice(1).map(Number);
    if (octets.some((n) => n > 255)) return null;
    return octets;
}

function isPrivateV4(octets) {
    const [a, b] = octets;
    if (a === 10) return true;                         // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true;  // 172.16.0.0/12
    if (a === 192 && b === 168) return true;           // 192.168.0.0/16
    if (a === 169 && b === 254) return true;           // 169.254.0.0/16 (link-local)
    return false;
}

/**
 * Classifica um IP contra o modo dado. Retorna a razão do bloqueio (string)
 * ou null se for permitido.
 */
function blockReasonForIp(ip, mode) {
    const v6 = ip.toLowerCase();
    const octets = ipv4Octets(ip);

    // Loopback (bloqueado em moderate e strict)
    if (v6 === "::1" || ip === "0.0.0.0" || (octets && octets[0] === 127)) {
        return "loopback";
    }
    // Metadata de nuvem (bloqueado em moderate e strict)
    if (ip === METADATA_IP) {
        return "endereço de metadata de nuvem (169.254.169.254)";
    }
    if (mode === "strict") {
        if (octets && isPrivateV4(octets)) return "IP privado (modo strict)";
        if (/^f[cd][0-9a-f]{2}:/.test(v6)) return "IPv6 unique-local (modo strict)"; // fc00::/7
        if (/^fe80:/.test(v6)) return "IPv6 link-local (modo strict)";
    }
    return null;
}

/**
 * Valida que `url` aponta para um destino seguro conforme o modo. Lança Error
 * se o host for bloqueado, a URL for inválida ou o host não resolver.
 *
 * @param {string} url
 * @param {{ mode?: "off"|"moderate"|"strict" }} [opts]
 */
export async function assertSafeUrl(url, { mode = resolveMode() } = {}) {
    if (mode === "off") return;

    let parsed;
    try {
        parsed = new URL(url);
    } catch {
        throw new Error(`SSRF guard: URL inválida: ${url}`);
    }

    let host = parsed.hostname.toLowerCase();
    if (host.startsWith("[") && host.endsWith("]")) host = host.slice(1, -1); // IPv6 literal

    // "localhost" é sempre loopback, independente de DNS/hosts.
    if (host === "localhost") {
        throw new Error(`SSRF guard: host bloqueado (${host}): loopback [modo ${mode}]`);
    }

    // Reúne os IPs candidatos: literal (IPv4/IPv6) ou resolvido por DNS.
    let candidates;
    if (ipv4Octets(host) || host.includes(":")) {
        candidates = [host];
    } else {
        try {
            const results = await dns.lookup(host, { all: true });
            candidates = results.map((r) => r.address);
        } catch {
            throw new Error(`SSRF guard: não foi possível resolver o host: ${host}`);
        }
    }

    for (const ip of candidates) {
        const reason = blockReasonForIp(ip, mode);
        if (reason) {
            throw new Error(`SSRF guard: host bloqueado (${host} -> ${ip}): ${reason} [modo ${mode}]`);
        }
    }
}
