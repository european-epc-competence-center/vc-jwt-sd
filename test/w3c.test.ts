
import moment from 'moment';

import SD from "../src";

import testcase from './testcase'

const salter = testcase.salter

it('W3C Example', async () => {
  const alg = 'ES384'
  const iss = 'did:web:issuer.example'
  const nonce = '9876543210'
  const aud = 'did:web:verifier.example'
  const issuerKeyPair  = await SD.JWK.generate(alg)
  const holderKeyPair  = await SD.JWK.generate(alg)
  const digester = testcase.digester('sha-256')
  const issuer = new SD.Issuer({
    alg,
    iss,
    digester,
    signer: await SD.JWS.signer(issuerKeyPair.secretKeyJwk),
    salter
  })
  const vc = await issuer.issue({
    iat: moment().unix(),
    exp: moment().add(1, 'month').unix(),
    holder: holderKeyPair.publicKeyJwk,
    claims: SD.YAML.load(`
"@context":
  - https://www.w3.org/ns/credentials/v2
  - https://w3id.org/traceability/v1
id: http://supply-chain.example/credentials/dd0c6f9a-5df6-40a3-bb34-863cd1fda606
type:
  - VerifiableCredential
  - EntryNumberCredential
validFrom: ${moment().toISOString()}
validUntil: ${moment().add(1, 'month').toISOString()}
issuer:
  type:
    - Organization
  id: ${iss}
  name: ACME Customs Broker
  !sd location:
    type:
      - Place
    address:
      type:
        - PostalAddress
      streetAddress: 123 Example Street
      addressLocality: Toronto
      addressRegion: ON
      addressCountry: CA
      postalCode: M3B 1A2
credentialSubject:
  type:
    - EntryNumber
  !sd entryNumber: "12345123456"
`)
  })
  const holder = new SD.Holder({
    alg,
    digester,
    signer: await SD.JWS.signer(holderKeyPair.secretKeyJwk)
  })
  const vp = await holder.present({
    credential: vc,
    nonce,
    aud,
    disclosure: SD.YAML.load(`
issuer:
  location: False
credentialSubject:
  entryNumber: True
    `),
  })
  const verifier = new SD.Verifier({
    alg,
    digester,
    verifier: {
      verify: async (token :string) => {
        const parsed = SD.Parse.compact(token)
        const verifier = await SD.JWS.verifier(issuerKeyPair.publicKeyJwk)
        return verifier.verify(parsed.jwt)
      }
    }
  })
  const verified = await verifier.verify({
    presentation: vp,
    nonce,
    aud
  })
  expect(verified.claimset.issuer.location).toBeUndefined()
  expect(verified.claimset.credentialSubject.entryNumber).toBe('12345123456')
  // console.log(JSON.stringify(verified, null, 2))
  // console.log(vc)
});