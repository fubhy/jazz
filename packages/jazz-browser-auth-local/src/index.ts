import {
    AccountID,
    AccountMigration,
    AgentSecret,
    cojsonInternals,
    LocalNode,
    Peer,
} from "cojson";
import { AuthProvider, SessionProvider } from "jazz-browser";

type LocalStorageData = {
    accountID: AccountID;
    accountSecret: AgentSecret;
};

const localStorageKey = "jazz-logged-in-secret";

export interface BrowserLocalAuthDriver {
    onReady: (next: {
        signUp: (username: string) => Promise<void>;
        logIn: () => Promise<void>;
    }) => void;
    onSignedIn: (next: { logOut: () => void }) => void;
}

export class BrowserLocalAuth implements AuthProvider {
    driver: BrowserLocalAuthDriver;
    appName: string;
    appHostname: string;

    constructor(
        driver: BrowserLocalAuthDriver,
        appName: string,
        // TODO: is this a safe default?
        appHostname: string = window.location.hostname
    ) {
        this.driver = driver;
        this.appName = appName;
        this.appHostname = appHostname;
    }

    async createNode(
        getSessionFor: SessionProvider,
        initialPeers: Peer[],
        migration?: AccountMigration
    ): Promise<LocalNode> {
        if (localStorage[localStorageKey]) {
            const localStorageData = JSON.parse(
                localStorage[localStorageKey]
            ) as LocalStorageData;

            const sessionID = await getSessionFor(localStorageData.accountID);

            const node = await LocalNode.withLoadedAccount({
                accountID: localStorageData.accountID,
                accountSecret: localStorageData.accountSecret,
                sessionID,
                peersToLoadFrom: initialPeers,
                migration,
            });

            this.driver.onSignedIn({ logOut });

            return Promise.resolve(node);
        } else {
            const node = await new Promise<LocalNode>(
                (doneSigningUpOrLoggingIn) => {
                    this.driver.onReady({
                        signUp: async (username) => {
                            const node = await signUp(
                                username,
                                getSessionFor,
                                this.appName,
                                this.appHostname,
                                migration
                            );
                            for (const peer of initialPeers) {
                                node.syncManager.addPeer(peer);
                            }
                            doneSigningUpOrLoggingIn(node);
                            this.driver.onSignedIn({ logOut });
                        },
                        logIn: async () => {
                            const node = await logIn(
                                getSessionFor,
                                this.appHostname,
                                initialPeers,
                                migration
                            );
                            doneSigningUpOrLoggingIn(node);
                            this.driver.onSignedIn({ logOut });
                        },
                    });
                }
            );

            return node;
        }
    }
}

async function signUp(
    username: string,
    getSessionFor: SessionProvider,
    appName: string,
    appHostname: string,
    migration?: AccountMigration
): Promise<LocalNode> {
    const secretSeed = cojsonInternals.newRandomSecretSeed();

    const { node, accountID, accountSecret } =
        await LocalNode.withNewlyCreatedAccount({
            name: username,
            initialAgentSecret: cojsonInternals.agentSecretFromSecretSeed(secretSeed),
            migration,
        });

    const webAuthNCredentialPayload = new Uint8Array(
        cojsonInternals.secretSeedLength + cojsonInternals.shortHashLength
    );

    webAuthNCredentialPayload.set(secretSeed);
    webAuthNCredentialPayload.set(
        cojsonInternals.rawCoIDtoBytes(accountID),
        cojsonInternals.secretSeedLength
    );

    const webAuthNCredential = await navigator.credentials.create({
        publicKey: {
            challenge: Uint8Array.from([0, 1, 2]),
            rp: {
                name: appName,
                id: appHostname,
            },
            user: {
                id: webAuthNCredentialPayload,
                name: username + ` (${new Date().toLocaleString()})`,
                displayName: username,
            },
            pubKeyCredParams: [{ alg: -7, type: "public-key" }],
            authenticatorSelection: {
                authenticatorAttachment: "platform",
            },
            timeout: 60000,
            attestation: "direct",
        },
    });

    console.log(webAuthNCredential, accountID);

    localStorage[localStorageKey] = JSON.stringify({
        accountID,
        accountSecret,
    } satisfies LocalStorageData);

    node.currentSessionID = await getSessionFor(accountID);

    return node;
}

async function logIn(
    getSessionFor: SessionProvider,
    appHostname: string,
    initialPeers: Peer[],
    migration?: AccountMigration
): Promise<LocalNode> {
    const webAuthNCredential = (await navigator.credentials.get({
        publicKey: {
            challenge: Uint8Array.from([0, 1, 2]),
            rpId: appHostname,
            allowCredentials: [],
            timeout: 60000,
        },
    })) as unknown as {
        response: { userHandle: ArrayBuffer };
    };
    if (!webAuthNCredential) {
        throw new Error("Couldn't log in");
    }

    const webAuthNCredentialPayload = new Uint8Array(
        webAuthNCredential.response.userHandle
    );
    const accountSecretSeed = webAuthNCredentialPayload.slice(
        0,
        cojsonInternals.secretSeedLength
    );

    const accountID = cojsonInternals.rawCoIDfromBytes(
        webAuthNCredentialPayload.slice(
            cojsonInternals.secretSeedLength,
            cojsonInternals.secretSeedLength + cojsonInternals.shortHashLength
        )
    ) as AccountID;

    const accountSecret = cojsonInternals.agentSecretFromSecretSeed(accountSecretSeed);

    if (!accountSecret) {
        throw new Error("Invalid credential");
    }

    localStorage[localStorageKey] = JSON.stringify({
        accountID,
        accountSecret,
    } satisfies LocalStorageData);

    const node = await LocalNode.withLoadedAccount({
        accountID,
        accountSecret,
        sessionID: await getSessionFor(accountID),
        peersToLoadFrom: initialPeers,
        migration,
    });

    return node;
}

function logOut() {
    delete localStorage[localStorageKey];
}
