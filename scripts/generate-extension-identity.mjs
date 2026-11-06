import {
  createHash,
  createPrivateKey,
  createPublicKey,
} from 'node:crypto';
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';

const projectRoot = new URL('../', import.meta.url);
const buildDirectory = new URL('build/', projectRoot);
const idUrl = new URL('extension-id.txt', buildDirectory);
const manifestUrl = new URL('chrome-extension/manifest.json', projectRoot);

mkdirSync(buildDirectory, { recursive: true });

const manifest = JSON.parse(readFileSync(manifestUrl, 'utf8'));
let manifestKey = manifest.key;
const externalKeyPath = process.env.PETES_GARDEN_EXTENSION_PRIVATE_KEY_PATH;
if (externalKeyPath) {
  const privateKey = createPrivateKey(readFileSync(externalKeyPath, 'utf8'));
  if (privateKey.asymmetricKeyType !== 'rsa' || privateKey.asymmetricKeyDetails?.modulusLength !== 2048) {
    throw new Error('The external extension private key must be a 2048-bit RSA key');
  }
  const externalManifestKey = createPublicKey(privateKey).export({ type: 'spki', format: 'der' }).toString('base64');
  if (manifestKey && manifestKey !== externalManifestKey) {
    throw new Error('The external private key does not match the existing manifest identity');
  }
  manifestKey = externalManifestKey;
  manifest.key = manifestKey;
  writeFileSync(manifestUrl, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
}
if (typeof manifestKey !== 'string' || !/^[A-Za-z0-9+/]+={0,2}$/.test(manifestKey)) {
  throw new Error('manifest.json must contain a stable public key, or set PETES_GARDEN_EXTENSION_PRIVATE_KEY_PATH');
}

const publicDer = Buffer.from(manifestKey, 'base64');
const publicKey = createPublicKey({ key: publicDer, format: 'der', type: 'spki' });
if (publicKey.asymmetricKeyType !== 'rsa' || publicKey.asymmetricKeyDetails?.modulusLength !== 2048) {
  throw new Error('The manifest public key must be a 2048-bit RSA key');
}
const digest = createHash('sha256').update(publicDer).digest().subarray(0, 16);
const extensionId = [...digest]
  .flatMap((byte) => [byte >> 4, byte & 15])
  .map((nibble) => String.fromCharCode(97 + nibble))
  .join('');

writeFileSync(idUrl, `${extensionId}\n`, 'utf8');

process.stdout.write(`${extensionId}\n`);
