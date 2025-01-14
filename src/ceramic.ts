import ThreeIdResolver from "@ceramicnetwork/3id-did-resolver";
import type { CeramicApi } from "@ceramicnetwork/common";
import Ceramic from "@ceramicnetwork/http-client";
import { Caip10Link } from "@ceramicnetwork/stream-caip10-link";
import { TileDocument } from "@ceramicnetwork/stream-tile";
import { ResolverRegistry } from "did-resolver";
import { DID } from "dids";
import KeyDidResolver from "key-did-resolver";
import { createIDX } from "./idx";
import { decodeb64, encodeb64 } from "./lit";
import { getAddress, getProvider } from "./wallet";

declare global {
  interface Window {
    ceramic?: CeramicApi;
    [index: string]: any;
  }
}

/**
 * Authenticate for Lit + Ceramic.
 * Creates a CeramicApi object on the ceramic testnet
 *
 * @returns {Promise<CeramicApi>} ceramicPromise pass in _createCeramic() promise
 */
export async function _createCeramic(
  ceramicNodeUrl: string
): Promise<CeramicApi> {
  const ceramic = new Ceramic(ceramicNodeUrl);
  window.ceramic = ceramic;
  window.TileDocument = TileDocument;
  window.Caip10Link = Caip10Link;

  return Promise.resolve(ceramic as CeramicApi);
}

/**
 * Authenticate for Lit + Ceramic.
 * This uses a wallet provider to interact with the user's wallet
 * Once the user has authorized, the address is retrieved and the
 * decentralized identity is created.  An IDX is also created for
 * convenience.
 *
 * @param {Promise<CeramicApi>} ceramicPromise pass in _createCeramic() promise
 * @returns {Promise<Array<any>>} Promise of ceramic IDX ID, ceramic object
 * and user's ETH Address
 */
export async function _authenticateCeramic(
  ceramicPromise: Promise<CeramicApi>
): Promise<Array<any>> {
  console.log("authenticate Ceramic!");

  const provider = await getProvider();
  const [ceramic, address] = await Promise.all([ceramicPromise, getAddress()]);
  const keyDidResolver = KeyDidResolver.getResolver();
  const threeIdResolver = ThreeIdResolver.getResolver(ceramic);
  const resolverRegistry: ResolverRegistry = {
    ...threeIdResolver,
    ...keyDidResolver,
  };
  const did = new DID({
    provider: provider,
    resolver: resolverRegistry,
  });

  await did.authenticate();
  await ceramic.setDID(did);
  const idx = createIDX(ceramic);
  window.did = ceramic.did;
  return Promise.resolve([idx.id, ceramic, address]);
}

/**
 * Write to Ceramic.  This function takes in an auth and what one would
 * like written and then sends it to a ceramic node in the proper format
 * @param {any[]} auth is the authentication passed via the persons wallet
 * @param {any[]} array of encrypted key, symkey, accessControlConditions, and chain
 * @returns {Promise<string>} promise with the ceramic streamID, can be used to look up data
 */
export async function _writeCeramic(
  auth: any[],
  toBeWritten: any[]
): Promise<String> {
  if (auth) {
    const ceramic = auth[1];
    const toStore = {
      encryptedZip: toBeWritten[0],
      symKey: toBeWritten[1],
      accessControlConditions: toBeWritten[2],
      chain: toBeWritten[3],
      accessControlConditionType: toBeWritten[4],
    };
    const doc = await TileDocument.create(ceramic, toStore, {
      // controllers: [concatId],
      family: "doc family",
    });
    return doc.id.toString();
  } else {
    console.error("Failed to authenticate in ceramic WRITE");
    return "error";
  }
}

export async function _updateCeramic(
  auth: any[],
  streamId: String,
  newContent: any[]
): Promise<String> {
  if (auth) {
    const ceramic = auth[1];
    const toStore = {
      encryptedZip: encodeb64(newContent[0]),
      symKey: encodeb64(newContent[1]),
      accessControlConditions: newContent[2],
      chain: newContent[3],
      accessControlConditionType: newContent[4],
    };

    const doc = await TileDocument.load(ceramic, streamId.valueOf());

    console.log(
      "$$$kl - loaded previous ceramic data from StreamID: ",
      streamId.valueOf()
    );
    console.log("$$$kl - previous doc: ", doc);
    console.log("$$$kl - new access control conditions: ", newContent[1]);
    await doc.update(toStore);
    console.log("$$$kl - new doc: ", doc);
    return "updated access conditions stored in Ceramic";
  } else {
    console.error("Failed to authenticate in ceramic WRITE");
    return "error";
  }
}

/**
 * Read to Ceramic.  This function takes in an auth and the streamID of the desired data and then sends it to a ceramic node in the proper format getting back a promised string of whatever was stored
 *
 * @param {any[]} auth is the authentication passed via the user's wallet
 * @param {String} streamId ID hash of the stream
 * @returns {Promise<string>} promise with the ceramic streamID's output
 */
export async function _readCeramic(
  ceramic: CeramicApi,
  streamId: string
): Promise<string> {
  const stream = await ceramic.loadStream(streamId);
  return stream.content;
}

/**
 * Decode info from base64.  Data is stored in base64 to make upload to ceramic
 * more seamless.  This function decodes it so it can be decrypted with Lit in
 * the next step in the read and decrypt process
 *
 * @param {string} response response received from ceramic streamID
 * @returns {Promise<Array<any>} array of decrypted zip and symmetric key + AAC and chain
 */
export async function _decodeFromB64(response: string) {
  // data is encoded in base64, decode
  // const jason = JSON.stringify(response);
  try {
    // @ts-ignore
    const enZip = response["encryptedZip"];
    const deZip = decodeb64(enZip);

    // @ts-ignore
    const enSym = response["symKey"];
    const deSym = decodeb64(enSym);

    // @ts-ignore
    const accessControlConditions = response["accessControlConditions"];
    // @ts-ignore
    const chain = response["chain"];
    // @ts-ignore
    const accessControlConditionType = response["accessControlConditionType"];
    return [
      deZip,
      deSym,
      accessControlConditions,
      chain,
      accessControlConditionType,
    ];
  } catch (error) {
    return "There was an error decrypting, is it possible you inputted the wrong streamID?";
  }
}
