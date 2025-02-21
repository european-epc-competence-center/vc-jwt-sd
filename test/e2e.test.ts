import crypto from 'crypto'
import moment from 'moment';
import { base64url, exportJWK, generateKeyPair } from 'jose';
import SD from "../src";
import testcase from './testcase'
it('End to End Test', async () => {
  const alg = 'ES384'
  const iss = 'did:web:issuer.example'
  const nonce = '9876543210'
  const aud = 'did:web:verifier.example'
  const issuerKeyPair  = await generateKeyPair(alg)
  const holderKeyPair  = await generateKeyPair(alg)
  const digester = testcase.digester('sha-256')
  const issuerPublicKey = await exportJWK(issuerKeyPair.publicKey)
  const issuerPrivateKey = await exportJWK(issuerKeyPair.privateKey)
  const issuerSigner = await SD.JWS.signer(issuerPrivateKey)
  const issuerVerifier = {
    verify: async (token :string) => {
      const parsed = SD.Parse.compact(token)
      const verifier = await SD.JWS.verifier(issuerPublicKey)
      return verifier.verify(parsed.jwt)
    }
  }
  const holderPublicKey = await exportJWK(holderKeyPair.publicKey)
  const holderPrivateKey = await exportJWK(holderKeyPair.privateKey)
  const holderSigner = await SD.JWS.signer(holderPrivateKey)
  const salter = () => {
    return base64url.encode(crypto.randomBytes(16));
  }
  const issuer = new SD.Issuer({
    alg,
    iss,
    digester,
    signer: issuerSigner,
    salter
  })
  const schema = SD.YAML.parseCustomTags(`
  
user_claims:
  array_with_recursive_sd:
    - boring
    - foo: "bar"
      !sd baz:
        qux: "quux"
    - [!sd "foo", !sd "bar"]

  test2: [!sd "foo", !sd "bar"]

holder_disclosed_claims:
  array_with_recursive_sd:
    - None
    - baz: True
    - [False, True]

  test2: [True, True]

expect_verified_user_claims:
  array_with_recursive_sd:
    - boring
    - foo: bar
      baz:
        qux: quux
    - ["bar"]

  test2: ["foo", "bar"]

  `)
  const vc = await issuer.issue({
    claims: schema.get('user_claims'),
    iat: moment().unix(),
    exp: moment().add(1, 'years').unix(),
    holder: holderPublicKey
  })

  const holder = new SD.Holder({
    alg,
    digester,
    signer: holderSigner
  })

  const vp = await holder.present({
    credential: vc,
    disclosure: schema.get('holder_disclosed_claims'),
    nonce,
    aud
  })
  
  const verifier = new SD.Verifier({
    alg,
    digester,
    verifier: issuerVerifier
  })
  const verified = await verifier.verify({
    presentation: vp,
    nonce,
    aud
  })
  expect(verified.claimset.cnf.jwk).toEqual(holderPublicKey)
  expect(verified.claimset.array_with_recursive_sd).toEqual([
    "boring",
    {
      "foo": "bar",
      "baz": {
        qux: "quux"
      }
    },
    [
      "bar"
    ]
  ])
  expect(verified.claimset.test2).toEqual([
    "foo",
    "bar"
  ])
});