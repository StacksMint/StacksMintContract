import { describe, expect, it, beforeEach } from "vitest";
import { Cl } from "@stacks/transactions";

// =====================================================================
//  Accounts
// =====================================================================

const accounts = simnet.getAccounts();
const deployer = accounts.get("deployer")!;
const wallet1 = accounts.get("wallet_1")!;
const wallet2 = accounts.get("wallet_2")!;
const wallet3 = accounts.get("wallet_3")!;

const CONTRACT = "token-template";

// =====================================================================
//  Helpers
// =====================================================================

function getBalance(principal: string) {
    const { result } = simnet.callReadOnlyFn(
        CONTRACT,
        "get-balance",
        [Cl.principal(principal)],
        principal
    );
    return result;
}

function getTotalSupply() {
    const { result } = simnet.callReadOnlyFn(CONTRACT, "get-total-supply", [], deployer);
    return result;
}

// =====================================================================
//  SIP-010 METADATA
// =====================================================================

describe("SIP-010 metadata getters", () => {
    it("get-name returns the token name", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-name", [], deployer);
        expect(result).toBeOk(Cl.stringAscii("My Token"));
    });

    it("get-symbol returns the token symbol", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-symbol", [], deployer);
        expect(result).toBeOk(Cl.stringAscii("MTK"));
    });

    it("get-decimals returns 6", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-decimals", [], deployer);
        expect(result).toBeOk(Cl.uint(6));
    });

    it("get-token-uri returns the configured URI", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-token-uri", [], deployer);
        expect(result).toBeOk(
            Cl.some(Cl.stringUtf8("https://example.com/token-metadata.json"))
        );
    });

    it("get-total-supply returns the initial supply", () => {
        expect(getTotalSupply()).toBeOk(Cl.uint(1_000_000_000_000));
    });
});

// =====================================================================
//  INITIAL STATE
// =====================================================================

describe("initial state after deployment", () => {
    it("deployer holds the full initial supply", () => {
        expect(getBalance(deployer)).toBeOk(Cl.uint(1_000_000_000_000));
    });

    it("other wallets start with zero balance", () => {
        expect(getBalance(wallet1)).toBeOk(Cl.uint(0));
        expect(getBalance(wallet2)).toBeOk(Cl.uint(0));
    });

    it("mintable is false by default", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "is-mintable", [], deployer);
        expect(result).toBeOk(Cl.bool(false));
    });

    it("get-owner returns the deployer", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-owner", [], deployer);
        expect(result).toBeOk(Cl.principal(deployer));
    });
});

// =====================================================================
//  TRANSFER
// =====================================================================

describe("transfer", () => {
    it("deployer can transfer tokens to wallet1", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [
                Cl.uint(1_000_000),
                Cl.principal(deployer),
                Cl.principal(wallet1),
                Cl.none(),
            ],
            deployer
        );
        expect(result).toBeOk(Cl.bool(true));
        expect(getBalance(wallet1)).toBeOk(Cl.uint(1_000_000));
        expect(getBalance(deployer)).toBeOk(Cl.uint(999_999_000_000));
    });

    it("transfer with a memo succeeds", () => {
        const memo = Cl.some(Cl.bufferFromHex("deadbeef"));
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [Cl.uint(500), Cl.principal(deployer), Cl.principal(wallet2), memo],
            deployer
        );
        expect(result).toBeOk(Cl.bool(true));
    });

    it("fails when sender is not tx-sender (ERR-NOT-TOKEN-OWNER u101)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [
                Cl.uint(1_000),
                Cl.principal(deployer), // sender is deployer but caller is wallet1
                Cl.principal(wallet2),
                Cl.none(),
            ],
            wallet1 // wallet1 tries to move deployer's tokens
        );
        expect(result).toBeErr(Cl.uint(101));
    });

    it("fails when amount is zero (ERR-INVALID-AMOUNT u103)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [Cl.uint(0), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
            deployer
        );
        expect(result).toBeErr(Cl.uint(103));
    });

    it("fails when sender has insufficient balance", () => {
        // wallet1 has 0 at this point
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [
                Cl.uint(1_000_000),
                Cl.principal(wallet1),
                Cl.principal(wallet2),
                Cl.none(),
            ],
            wallet1
        );
        expect(result).toBeErr(Cl.uint(1)); // ft-transfer? native insufficient funds error
    });
});

// =====================================================================
//  MINT
// =====================================================================

describe("mint", () => {
    it("fails when mintable is false (ERR-NOT-MINTABLE u104)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "mint",
            [Cl.uint(1_000_000), Cl.principal(wallet1)],
            deployer
        );
        expect(result).toBeErr(Cl.uint(104));
    });

    it("owner can enable mintable", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "set-mintable",
            [Cl.bool(true)],
            deployer
        );
        expect(result).toBeOk(Cl.bool(true));

        const { result: mintable } = simnet.callReadOnlyFn(
            CONTRACT,
            "is-mintable",
            [],
            deployer
        );
        expect(mintable).toBeOk(Cl.bool(true));
    });

    it("owner can mint new tokens after enabling mintable", () => {
        simnet.callPublicFn(CONTRACT, "set-mintable", [Cl.bool(true)], deployer);
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "mint",
            [Cl.uint(5_000_000), Cl.principal(wallet1)],
            deployer
        );
        expect(result).toBeOk(Cl.uint(5_000_000));
        expect(getBalance(wallet1)).toBeOk(Cl.uint(5_000_000));
    });

    it("non-owner cannot mint (ERR-NOT-AUTHORIZED u100)", () => {
        simnet.callPublicFn(CONTRACT, "set-mintable", [Cl.bool(true)], deployer);
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "mint",
            [Cl.uint(1_000_000), Cl.principal(wallet1)],
            wallet1 // not the owner
        );
        expect(result).toBeErr(Cl.uint(100));
    });

    it("fails with zero amount even when mintable (ERR-INVALID-AMOUNT u103)", () => {
        simnet.callPublicFn(CONTRACT, "set-mintable", [Cl.bool(true)], deployer);
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "mint",
            [Cl.uint(0), Cl.principal(wallet1)],
            deployer
        );
        expect(result).toBeErr(Cl.uint(103));
    });

    it("non-owner cannot change mintable flag (ERR-NOT-AUTHORIZED u100)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "set-mintable",
            [Cl.bool(true)],
            wallet1
        );
        expect(result).toBeErr(Cl.uint(100));
    });
});

// =====================================================================
//  BURN
// =====================================================================

describe("burn", () => {
    it("token holder can burn their own tokens", () => {
        simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [Cl.uint(10_000), Cl.principal(deployer), Cl.principal(wallet1), Cl.none()],
            deployer
        );
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "burn",
            [Cl.uint(5_000), Cl.principal(wallet1)],
            wallet1
        );
        expect(result).toBeOk(Cl.uint(5_000));
        expect(getBalance(wallet1)).toBeOk(Cl.uint(5_000));
    });

    it("burning reduces total supply", () => {
        const supplyBefore = simnet.callReadOnlyFn(CONTRACT, "get-total-supply", [], deployer).result;

        simnet.callPublicFn(
            CONTRACT,
            "transfer",
            [Cl.uint(10_000), Cl.principal(deployer), Cl.principal(wallet2), Cl.none()],
            deployer
        );
        simnet.callPublicFn(
            CONTRACT,
            "burn",
            [Cl.uint(10_000), Cl.principal(wallet2)],
            wallet2
        );

        const supplyAfter = simnet.callReadOnlyFn(CONTRACT, "get-total-supply", [], deployer).result;
        // supply should have decreased by 10_000
        expect(supplyAfter).toBeOk(
            Cl.uint((supplyBefore as any).value.value - BigInt(10_000))
        );
    });

    it("cannot burn someone else's tokens (ERR-NOT-TOKEN-OWNER u101)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "burn",
            [Cl.uint(1_000), Cl.principal(deployer)],
            wallet1 // not the deployer
        );
        expect(result).toBeErr(Cl.uint(101));
    });

    it("fails with zero amount (ERR-INVALID-AMOUNT u103)", () => {
        const { result } = simnet.callPublicFn(
            CONTRACT,
            "burn",
            [Cl.uint(0), Cl.principal(deployer)],
            deployer
        );
        expect(result).toBeErr(Cl.uint(103));
    });
});

// =====================================================================
//  COUNTER UTILITY
// =====================================================================

describe("counter utility", () => {
    it("counter starts at 0", () => {
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-counter", [], deployer);
        expect(result).toBeOk(Cl.uint(0));
    });

    it("increment increases counter by 1", () => {
        simnet.callPublicFn(CONTRACT, "increment", [], wallet1);
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-counter", [], wallet1);
        expect(result).toBeOk(Cl.uint(1));
    });

    it("multiple increments accumulate correctly", () => {
        simnet.callPublicFn(CONTRACT, "increment", [], wallet1);
        simnet.callPublicFn(CONTRACT, "increment", [], wallet1);
        simnet.callPublicFn(CONTRACT, "increment", [], wallet1);
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-counter", [], wallet1);
        expect(result).toBeOk(Cl.uint(3));
    });

    it("decrement decreases counter by 1", () => {
        simnet.callPublicFn(CONTRACT, "increment", [], wallet1);
        simnet.callPublicFn(CONTRACT, "increment", [], wallet1);
        simnet.callPublicFn(CONTRACT, "decrement", [], wallet1);
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-counter", [], wallet1);
        expect(result).toBeOk(Cl.uint(1));
    });

    it("decrement at zero fails with underflow error (ERR-COUNTER-UNDERFLOW u105)", () => {
        const { result } = simnet.callPublicFn(CONTRACT, "decrement", [], wallet1);
        expect(result).toBeErr(Cl.uint(105));
    });

    it("anyone can increment and decrement", () => {
        simnet.callPublicFn(CONTRACT, "increment", [], wallet2);
        simnet.callPublicFn(CONTRACT, "increment", [], wallet3);
        const { result } = simnet.callReadOnlyFn(CONTRACT, "get-counter", [], wallet1);
        expect(result).toBeOk(Cl.uint(2));
    });
});
