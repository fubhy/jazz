import { newRandomSessionID } from "cojson/coValueCore";
import { cojsonReady } from "cojson";
import { LocalNode } from "cojson/localNode";
import { connectedPeers } from "cojson/streamUtils";
import { beforeEach, test, expect } from "vitest";

beforeEach(async () => {
    await cojsonReady;
});

test("Can create a node while creating a new account with profile", async () => {
    const { node, accountID, accountSecret, sessionID } =
        await LocalNode.withNewlyCreatedAccount({ name: "Hermes Puggington" });

    expect(node).not.toBeNull();
    expect(accountID).not.toBeNull();
    expect(accountSecret).not.toBeNull();
    expect(sessionID).not.toBeNull();

    expect(node.expectProfileLoaded(accountID).get("name")).toEqual(
        "Hermes Puggington"
    );
});

test("A node with an account can create groups and and objects within them", async () => {
    const { node, accountID } = await LocalNode.withNewlyCreatedAccount({
        name: "Hermes Puggington",
    });

    const group = await node.createGroup();
    expect(group).not.toBeNull();

    let map = group.createMap();
    map = map.edit((edit) => {
        edit.set("foo", "bar", "private");
        expect(edit.get("foo")).toEqual("bar");
    });

    expect(map.get("foo")).toEqual("bar");

    expect(map.lastEditAt("foo")?.by).toEqual(accountID);
});

test("Can create account with one node, and then load it on another", async () => {
    const { node, accountID, accountSecret } =
        await LocalNode.withNewlyCreatedAccount({ name: "Hermes Puggington" });

    const group = await node.createGroup();
    expect(group).not.toBeNull();

    let map = group.createMap();
    map = map.edit((edit) => {
        edit.set("foo", "bar", "private");
        expect(edit.get("foo")).toEqual("bar");
    });

    const [node1asPeer, node2asPeer] = connectedPeers("node1", "node2", {
        trace: true,
        peer1role: "server",
        peer2role: "client",
    });

    node.syncManager.addPeer(node2asPeer);

    const node2 = await LocalNode.withLoadedAccount({
        accountID,
        accountSecret,
        sessionID: newRandomSessionID(accountID),
        peersToLoadFrom: [node1asPeer],
    });

    const map2 = await node2.load(map.id);
    if (map2 === "unavailable") throw new Error("Map unavailable");

    expect(map2.get("foo")).toEqual("bar");
});
