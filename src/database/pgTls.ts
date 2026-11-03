// ─── TLS das ligações Postgres (Supabase) ────────────────────────────────────
// CÓPIA de PixelStudio/packages/shared/src/pgTls.ts (a fonte única). Mudar lá e copiar
// para aqui — os testes de cada bot confirmam que a ligação fica verificada.
//
// Porque existe: o site ligava-se à base de dados SEM cifra (a password e os dados
// iam em claro pela internet) e os bots cifravam mas sem verificar o certificado — o
// que deixa qualquer intermediário fazer-se passar pela base de dados. A Supabase
// assina os certificados com a sua própria CA (não está nas CAs do sistema), por isso
// a verificação só funciona com ela à mão. É um certificado PÚBLICO, não um segredo.

/** "Supabase Root 2021 CA" — válida até 2031-04-26.
 *  SHA-256: 80:70:25:AD:50:D4:ED:21:9D:2C:9C:7D:29:9C:00:4F:82:4E:B0:0C:F7:F6:5A:FE:F6:07:D0:7B:72:E6:CA:FA */
export const SUPABASE_ROOT_CA_2021 = `-----BEGIN CERTIFICATE-----
MIIDxDCCAqygAwIBAgIUbLxMod62P2ktCiAkxnKJwtE9VPYwDQYJKoZIhvcNAQEL
BQAwazELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5l
dyBDYXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJh
c2UgUm9vdCAyMDIxIENBMB4XDTIxMDQyODEwNTY1M1oXDTMxMDQyNjEwNTY1M1ow
azELMAkGA1UEBhMCVVMxEDAOBgNVBAgMB0RlbHdhcmUxEzARBgNVBAcMCk5ldyBD
YXN0bGUxFTATBgNVBAoMDFN1cGFiYXNlIEluYzEeMBwGA1UEAwwVU3VwYWJhc2Ug
Um9vdCAyMDIxIENBMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAqQXW
QyHOB+qR2GJobCq/CBmQ40G0oDmCC3mzVnn8sv4XNeWtE5XcEL0uVih7Jo4Dkx1Q
DmGHBH1zDfgs2qXiLb6xpw/CKQPypZW1JssOTMIfQppNQ87K75Ya0p25Y3ePS2t2
GtvHxNjUV6kjOZjEn2yWEcBdpOVCUYBVFBNMB4YBHkNRDa/+S4uywAoaTWnCJLUi
cvTlHmMw6xSQQn1UfRQHk50DMCEJ7Cy1RxrZJrkXXRP3LqQL2ijJ6F4yMfh+Gyb4
O4XajoVj/+R4GwywKYrrS8PrSNtwxr5StlQO8zIQUSMiq26wM8mgELFlS/32Uclt
NaQ1xBRizkzpZct9DwIDAQABo2AwXjALBgNVHQ8EBAMCAQYwHQYDVR0OBBYEFKjX
uXY32CztkhImng4yJNUtaUYsMB8GA1UdIwQYMBaAFKjXuXY32CztkhImng4yJNUt
aUYsMA8GA1UdEwEB/wQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAB8spzNn+4VU
tVxbdMaX+39Z50sc7uATmus16jmmHjhIHz+l/9GlJ5KqAMOx26mPZgfzG7oneL2b
VW+WgYUkTT3XEPFWnTp2RJwQao8/tYPXWEJDc0WVQHrpmnWOFKU/d3MqBgBm5y+6
jB81TU/RG2rVerPDWP+1MMcNNy0491CTL5XQZ7JfDJJ9CCmXSdtTl4uUQnSuv/Qx
Cea13BX2ZgJc7Au30vihLhub52De4P/4gonKsNHYdbWjg7OWKwNv/zitGDVDB9Y2
CMTyZKG3XEu5Ghl1LEnI3QmEKsqaCLv12BnVjbkSeZsMnevJPs1Ye6TjjJwdik5P
o/bKiIz+Fq8=
-----END CERTIFICATE-----
`;

export type PgSsl = false | { rejectUnauthorized: boolean; ca?: string };

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1", "::1", "[::1]"]);
// Parâmetros de TLS no URL: tiram-se sempre. O `pg` deixa os do URL passarem por cima da
// opção `ssl` — um `sslmode=require` no .env desligava a verificação sem ninguém dar conta.
const TLS_URL_PARAMS = ["sslmode", "ssl", "sslrootcert", "sslcert", "sslkey", "uselibpqcompat"];

function isSupabaseHost(hostname: string): boolean {
    const host = hostname.toLowerCase();
    return host.endsWith(".supabase.com") || host.endsWith(".supabase.co");
}

/**
 * Decide o TLS de uma ligação Postgres e devolve o URL limpo + a opção `ssl` do `pg`.
 *
 * - Por omissão, qualquer base de dados remota leva TLS **verificado** (certificado e
 *   nome do servidor); na Supabase, contra a CA dela.
 * - `sslmode=disable` só para quem o pede explicitamente (p.ex. o Postgres do Docker local).
 * - `sslmode=no-verify` desliga a verificação — só para diagnóstico, nunca em produção.
 * - Localhost sem `sslmode` vai sem TLS (desenvolvimento).
 */
export function resolvePgTls(rawUrl: string, envSslMode?: string): { connectionString: string; ssl: PgSsl } {
    let url: URL;
    try {
        url = new URL(rawUrl);
    } catch {
        // URL que o `URL` não percebe: deixa-se ao `pg`, mas nunca sem verificação.
        return { connectionString: rawUrl, ssl: { rejectUnauthorized: true } };
    }

    const mode = (url.searchParams.get("sslmode") ?? envSslMode ?? "").trim().toLowerCase();
    for (const param of TLS_URL_PARAMS) url.searchParams.delete(param);
    const connectionString = url.toString();

    if (mode === "disable") return { connectionString, ssl: false };
    if (LOCAL_HOSTS.has(url.hostname.toLowerCase()) && !mode) return { connectionString, ssl: false };
    if (mode === "no-verify") return { connectionString, ssl: { rejectUnauthorized: false } };
    return {
        connectionString,
        ssl: isSupabaseHost(url.hostname) ? { rejectUnauthorized: true, ca: SUPABASE_ROOT_CA_2021 } : { rejectUnauthorized: true },
    };
}
