import { createHmac, timingSafeEqual } from "node:crypto";

type JwtPayload = {
  exp?: number;
  nbf?: number;
};

function base64UrlDecode(value: string): Buffer {
  return Buffer.from(value, "base64url");
}

function safeEqual(left: Buffer, right: Buffer): boolean {
  return left.length === right.length && timingSafeEqual(left, right);
}

function verifyWithKey(token: string, key: string, nowSeconds: number): boolean {
  const [header, payload, signature, extra] = token.split(".");

  if (!header || !payload || !signature || extra) {
    return false;
  }

  const expected = createHmac("sha256", key).update(`${header}.${payload}`).digest();
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

  if (claims.nbf !== undefined && claims.nbf > nowSeconds + 30) {
    return false;
  }

  if (claims.exp !== undefined && claims.exp < nowSeconds - 30) {
    return false;
  }

  return true;
}

export function verifyQstashSignature(input: {
  signature: string | undefined;
  currentSigningKey: string | undefined;
  nextSigningKey: string | undefined;
  now?: Date;
}): boolean {
  if (!input.signature) {
    return false;
  }

  const keys = [input.currentSigningKey, input.nextSigningKey].filter(
    (key): key is string => Boolean(key),
  );
  const nowSeconds = Math.floor((input.now?.getTime() ?? Date.now()) / 1000);

  return keys.some((key) => verifyWithKey(input.signature as string, key, nowSeconds));
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
