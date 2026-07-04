import { createHash, createHmac, timingSafeEqual } from "node:crypto";

type JwtPayload = {
  iss?: string;
  sub?: string;
  exp?: unknown;
  nbf?: unknown;
  body?: string;
};

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function bodyHash(value: string): string {
  return createHash("sha256").update(value).digest("base64url").replace(/=+$/, "");
}

function verifyWithKey(input: {
  token: string;
  key: string;
  nowSeconds: number;
  body: string;
  url: string;
}): boolean {
  const [header, payload, signature, extra] = input.token.split(".");

  if (!header || !payload || !signature || extra) {
    return false;
  }

  const expected = createHmac("sha256", input.key).update(`${header}.${payload}`).digest();
  const actual = base64UrlDecode(signature);

  if (!safeEqual(actual, expected)) {
    return false;
  }

  let claims: JwtPayload;

  try {
    claims = JSON.parse(base64UrlDecode(payload).toString("utf8")) as JwtPayload;
  } catch {
    return false;
  }

  if (
    claims.iss !== "Upstash" ||
    claims.sub !== input.url ||
    typeof claims.nbf !== "number" ||
    typeof claims.exp !== "number" ||
    !claims.body
  ) {
    return false;
  }

  if (claims.nbf > input.nowSeconds + 30) {
    return false;
  }

  if (claims.exp < input.nowSeconds - 30) {
    return false;
  }

  if (claims.body.replace(/=+$/, "") !== bodyHash(input.body)) {
    return false;
  }

  return true;
}

export function verifyQstashSignature(input: {
  signature: string | undefined;
  currentSigningKey: string | undefined;
  nextSigningKey: string | undefined;
  body: string | undefined;
  url: string;
  now?: Date;
}): boolean {
  if (!input.signature || input.body === undefined) {
    return false;
  }

  const keys = [input.currentSigningKey, input.nextSigningKey].filter((key): key is string =>
    Boolean(key),
  );
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);

  return keys.some((key) =>
    verifyWithKey({
      token: input.signature as string,
      key,
      nowSeconds,
      body: input.body as string,
      url: input.url,
    }),
  );
}

export function verifyInternalToken(input: {
  candidate: string | undefined;
  expected: string | undefined;
}): boolean {
  if (!input.candidate || !input.expected) {
    return false;
  }

  const candidate = Buffer.from(input.candidate);
  const expected = Buffer.from(input.expected);

  return safeEqual(candidate, expected);
}
