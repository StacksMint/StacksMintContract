import { describe, expect, it } from "vitest";
import { Cl } from "@stacks/transactions";

// =====================================================================
//  Accounts
// =====================================================================

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;

const CONTRACT = "stacksmint";

// Fake token contract principals to use in tests
// (these represent token contracts that "would" be deployed on-chain)
const fakeToken1 = wallet1;  // reuse a principal as a stand-in contract address
const fakeToken2 = wallet2;

// Registration fee in micro-STX (1 STX)
const REGISTRATION_FEE = 1_000_000n;

// =====================================================================
//  HELPERS
// =====================================================================

function registerToken(
    caller: string,
    tokenContract: string,
    name = "Test Token",
    symbol = "TST",
    decimals = 6,
    supply = 1_000_000_000_000,
    uri: string | null = "https://example.com/token.json"
) {
    return simnet.callPublicFn(
        CONTRACT,
        "register-token",
        [
            Cl.principal(tokenContract),
            Cl.stringAscii(name),
            Cl.stringAscii(symbol),
            Cl.uint(decimals),
            Cl.uint(supply),
            uri ? Cl.some(Cl.stringUtf8(uri)) : Cl.none(),
        ],
        caller
    );
}

// =====================================================================
//  INITIAL STATE
// =====================================================================

describe("initial state", () => {
    it("token-count starts at zero", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-token-count", [], deployer);
        expect(result).toBeOk(Cl.uint(0));
    });

    it("registration fee is 1 STX (1,000,000 micro-STX)", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-registration-fee", [], deployer);
        expect(result).toBeOk(Cl.uint(1_000_000));
    });

    it("total-fees-collected starts at zero", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-total-fees-collected", [], deployer);
        expect(result).toBeOk(Cl.uint(0));
    });

    it("registry owner is the deployer", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-registry-owner", [], deployer);
        expect(result).toBeOk(Cl.principal(deployer));
    });

    it("a random contract is not registered", () => {
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "is-registered",
            [Cl.principal(fakeToken1)],
            deployer
        );
        expect(result).toBeBool(false);
    });

    it("get-tokens-by-owner returns empty list for new owner", () => {
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "get-tokens-by-owner",
            [Cl.principal(wallet1)],
            deployer
        );
        expect(result).toBeTuple({});  // default-to (list) returns an empty list
    });
});

// =====================================================================
//  REGISTER TOKEN — SUCCESS CASES
// =====================================================================

describe("register-token — happy path", () => {
    it("successfully registers a token and returns the new token ID (1)", () => {
        const { result } = registerToken(wallet1, fakeToken1);
        expect(result).toBeOk(Cl.uint(1));
    });

    it("token-count increments after registration", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-token-count", [], deployer);
        expect(result).toBeOk(Cl.uint(1));
    });

    it("registered token appears in get-token-info", () => {
        registerToken(wallet1, fakeToken1, "Alpha Token", "ALPHA", 6, 500_000_000, null);
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "get-token-info",
            [Cl.principal(fakeToken1)],
            deployer
        );
        // should return Some with correct name and symbol
        expect(result).toBeSome(
            Cl.tuple({
                id: Cl.uint(1),
                name: Cl.stringAscii("Alpha Token"),
                symbol: Cl.stringAscii("ALPHA"),
                decimals: Cl.uint(6),
                "total-supply": Cl.uint(500_000_000),
                "token-uri": Cl.none(),
                owner: Cl.principal(wallet1),
                "registered-at": Cl.uint(simnet.blockHeight),
            })
        );
    });

    it("token appears in get-tokens-by-owner for the registrant", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "get-tokens-by-owner",
            [Cl.principal(wallet1)],
            deployer
        );
        expect(result).toBeList([Cl.principal(fakeToken1)]);
    });

    it("is-registered returns true after successful registration", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "is-registered",
            [Cl.principal(fakeToken1)],
            deployer
        );
        expect(result).toBeBool(true);
    });

    it("multiple different wallets can register different tokens", () => {
        const r1 = registerToken(wallet1, fakeToken1, "Token A", "TKA", 6, 1_000_000);
        const r2 = registerToken(wallet2, fakeToken2, "Token B", "TKB", 8, 2_000_000);
        expect(r1.result).toBeOk(Cl.uint(1));
        expect(r2.result).toBeOk(Cl.uint(2));

        const { result: count } = simnet.callReadOnlyFn(CONTRACT, "get-token-count", [], deployer);
        expect(count).toBeOk(Cl.uint(2));
    });

    it("registration fee is collected (total-fees-collected increases)", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-total-fees-collected", [], deployer);
        expect(result).toBeOk(Cl.uint(Number(REGISTRATION_FEE)));
    });

    it("token with optional URI stores it correctly", () => {
        registerToken(wallet1, fakeToken1, "MyTok", "MTK", 6, 1_000_000, "ipfs://QmTest");
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "get-token-info",
            [Cl.principal(fakeToken1)],
            deployer
        );
        const entry = (result as any).value.value;
        expect(entry["token-uri"]).toStrictEqual(Cl.some(Cl.stringUtf8("ipfs://QmTest")));
    });
});

// =====================================================================
//  REGISTER TOKEN — FAILURE CASES
// =====================================================================

describe("register-token — failure cases", () => {
    it("cannot register the same token contract twice (ERR-ALREADY-REGISTERED u200)", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = registerToken(wallet1, fakeToken1);
        expect(result).toBeErr(Cl.uint(200));
    });

    it("fails with an empty name (ERR-INVALID-NAME u203)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "register-token",
            [
                Cl.principal(fakeToken1),
                Cl.stringAscii(""),   // empty name
                Cl.stringAscii("TST"),
                Cl.uint(6),
                Cl.uint(1_000_000),
                Cl.none(),
            ],
            wallet1
        );
        expect(result).toBeErr(Cl.uint(203));
    });

    it("fails with an empty symbol (ERR-INVALID-SYMBOL u204)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "register-token",
            [
                Cl.principal(fakeToken1),
                Cl.stringAscii("Test Token"),
                Cl.stringAscii(""),   // empty symbol
                Cl.uint(6),
                Cl.uint(1_000_000),
                Cl.none(),
            ],
            wallet1
        );
        expect(result).toBeErr(Cl.uint(204));
    });

    it("fails with zero total supply (ERR-INVALID-SUPPLY u205)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "register-token",
            [
                Cl.principal(fakeToken1),
                Cl.stringAscii("Test Token"),
                Cl.stringAscii("TST"),
                Cl.uint(6),
                Cl.uint(0),   // zero supply
                Cl.none(),
            ],
            wallet1
        );
        expect(result).toBeErr(Cl.uint(205));
    });
});

// =====================================================================
//  UPDATE TOKEN URI
// =====================================================================

describe("update-token-uri", () => {
    it("owner can update the token URI", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "update-token-uri",
            [Cl.principal(fakeToken1), Cl.some(Cl.stringUtf8("https://new-uri.com/meta.json"))],
            wallet1
        );
        expect(result).toBeOk(Cl.bool(true));

        // Verify the new URI is stored
        const { result: info } = simnet.callReadOnlyFn(
            CONTRACT,
            "get-token-info",
            [Cl.principal(fakeToken1)],
            deployer
        );
        const entry = (info as any).value.value;
        expect(entry["token-uri"]).toStrictEqual(
            Cl.some(Cl.stringUtf8("https://new-uri.com/meta.json"))
        );
    });

    it("owner can clear the token URI (set to none)", () => {
        registerToken(wallet1, fakeToken1, "MyTok", "MTK", 6, 1_000_000, "https://old-uri.com");
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "update-token-uri",
            [Cl.principal(fakeToken1), Cl.none()],
            wallet1
        );
        expect(result).toBeOk(Cl.bool(true));
    });

    it("non-owner cannot update the token URI (ERR-NOT-AUTHORIZED u201)", () => {
        registerToken(wallet1, fakeToken1);
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "update-token-uri",
            [Cl.principal(fakeToken1), Cl.some(Cl.stringUtf8("https://hacker.com"))],
            wallet2 // not the owner
        );
        expect(result).toBeErr(Cl.uint(201));
    });

    it("fails when token is not registered (ERR-TOKEN-NOT-FOUND u206)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "update-token-uri",
            [Cl.principal(fakeToken2), Cl.none()],
            wallet1
        );
        expect(result).toBeErr(Cl.uint(206));
    });
});

// =====================================================================
//  GET-TOKEN-INFO — UNREGISTERED
// =====================================================================

describe("get-token-info for unregistered token", () => {
    it("returns none for an unregistered token", () => {
        const { result } = simnet.callReadOnlyFn(
            CONTRACT,
            "get-token-info",
            [Cl.principal(fakeToken1)],
            deployer
        );
        expect(result).toBeNone();
    });
});
