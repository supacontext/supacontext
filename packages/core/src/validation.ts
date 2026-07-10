import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
import { z } from "zod";
import { creditDecimalToMicrocredits } from "./pricing.js";
import { CONTEXT_EFFORTS, PLATFORMS } from "./types.js";

const maxMetadataEntries = 50;
const maxMetadataValueSize = 4096;

export type WebhookDnsResolver = (hostname: string) => Promise<Array<{ address: string }>>;

const platformsSchema = z
  .array(z.enum(PLATFORMS))
  .min(1)
  .max(PLATFORMS.length)
  .refine((platforms) => new Set(platforms).size === platforms.length, {
    message: "platforms must not contain duplicates",
  });

const metadataSchema = z
  .record(z.string().max(100), z.unknown())
  .refine((metadata) => Object.keys(metadata).length <= maxMetadataEntries, {
    message: `metadata must not contain more than ${maxMetadataEntries} entries`,
  })
  .refine(
    (metadata) =>
      Object.values(metadata).every((value) => {
        try {
          const serialized = JSON.stringify(value);

          return serialized !== undefined && serialized.length <= maxMetadataValueSize;
        } catch {
          return false;
        }
      }),
    {
      message: `metadata values must not exceed ${maxMetadataValueSize} characters`,
    },
  );

function stripIpv6Brackets(hostname: string): string {
  return hostname.startsWith("[") && hostname.endsWith("]") ? hostname.slice(1, -1) : hostname;
}

function ipv4Parts(address: string): number[] | null {
  const parts = address.split(".").map((part) => Number(part));

  return parts.length === 4 &&
    parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255)
    ? parts
    : null;
}

function isBlockedIpv4(address: string): boolean {
  const parts = ipv4Parts(address);

  if (!parts) {
    return true;
  }

  const [a = 0, b = 0] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && (b === 0 || b === 168)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51)) ||
    (a === 203 && b === 0) ||
    a >= 224
  );
}

function expandIpv6(address: string): number[] | null {
  if (address.includes(".")) {
    const mappedIpv4 = address.split(":").at(-1);

    return mappedIpv4 && ipv4Parts(mappedIpv4) ? [0xffff] : null;
  }

  const [left = "", right = "", extra] = address.toLowerCase().split("::");

  if (extra !== undefined) {
    return null;
  }

  const leftParts = left ? left.split(":") : [];
  const rightParts = right ? right.split(":") : [];
  const missing = 8 - leftParts.length - rightParts.length;

  if (missing < 0) {
    return null;
  }

  const parts = [...leftParts, ...Array.from({ length: missing }, () => "0"), ...rightParts];

  if (parts.length !== 8) {
    return null;
  }

  const parsed = parts.map((part) => Number.parseInt(part, 16));

  return parsed.every((part) => Number.isInteger(part) && part >= 0 && part <= 0xffff)
    ? parsed
    : null;
}

function isBlockedIpv6(address: string): boolean {
  const parts = expandIpv6(address);

  if (!parts) {
    return true;
  }

  const [first = 0, second = 0] = parts;
  const allZero = parts.every((part) => part === 0);
  const isLoopback = parts.slice(0, 7).every((part) => part === 0) && parts[7] === 1;

  return (
    allZero ||
    isLoopback ||
    (first & 0xfe00) === 0xfc00 ||
    (first & 0xffc0) === 0xfe80 ||
    (first & 0xff00) === 0xff00 ||
    (first === 0x2001 && second === 0x0db8) ||
    (first === 0x2001 && second === 0)
  );
}

function isBlockedAddress(address: string): boolean {
  const version = isIP(address);

  if (version === 4) {
    return isBlockedIpv4(address);
  }

  if (version === 6) {
    return isBlockedIpv6(address);
  }

  return true;
}

function isLocalHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");

  return normalized === "localhost" || normalized.endsWith(".localhost");
}

async function resolveWebhookHostname(
  hostname: string,
  resolver: WebhookDnsResolver,
): Promise<Array<{ address: string }>> {
  const address = stripIpv6Brackets(hostname);

  if (isIP(address)) {
    return [{ address }];
  }

  return resolver(address);
}

export async function validateWebhookUrl(
  value: string,
  resolver: WebhookDnsResolver = async (hostname) => lookup(hostname, { all: true }),
): Promise<boolean> {
  let parsed: URL;

  try {
    parsed = new URL(value);
  } catch {
    return false;
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    isLocalHostname(parsed.hostname)
  ) {
    return false;
  }

  try {
    const addresses = await resolveWebhookHostname(parsed.hostname, resolver);

    return (
      addresses.length > 0 &&
      addresses.every((address) => !isBlockedAddress(stripIpv6Brackets(address.address)))
    );
  } catch {
    return false;
  }
}

const webhookUrlSchema = z
  .string()
  .trim()
  .pipe(z.url())
  .refine(async (url) => validateWebhookUrl(url), {
    message: "webhook_url must be an HTTPS public URL",
  });

const maxCreditsSchema = z
  .number()
  .positive()
  .max(250)
  .refine(
    (credits) => {
      try {
        creditDecimalToMicrocredits(credits);
        return true;
      } catch {
        return false;
      }
    },
    { message: "max_credits must have at most 6 decimal places" },
  );

export const contextRequestInputSchema = z
  .object({
    query: z.string().trim().min(1).max(4000),
    effort: z.enum(CONTEXT_EFFORTS).default("medium"),
    max_credits: maxCreditsSchema.optional(),
    platforms: platformsSchema.optional(),
    async: z.boolean().default(false),
    webhook_url: webhookUrlSchema.optional(),
    metadata: metadataSchema.optional(),
  })
  .strict();

export type ContextRequestInput = z.infer<typeof contextRequestInputSchema>;
