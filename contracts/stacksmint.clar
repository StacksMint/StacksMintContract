;; title: stacksmint
;; version: 1.0.0
;; summary: StacksMint Public Token Registry
;; description:
;;   A permissionless, on-chain directory of all tokens deployed
;;   through the StacksMint factory. Token creators register their
;;   deployed token contract here to make it publicly discoverable.
;;   A small STX anti-spam fee is charged per registration.

;; =============================================================
;;  ERROR CODES
;; =============================================================

(define-constant ERR-ALREADY-REGISTERED  (err u200))
(define-constant ERR-NOT-AUTHORIZED      (err u201))
(define-constant ERR-INVALID-NAME        (err u203))
(define-constant ERR-INVALID-SYMBOL      (err u204))
(define-constant ERR-INVALID-SUPPLY      (err u205))
(define-constant ERR-TOKEN-NOT-FOUND     (err u206))
(define-constant ERR-LIST-FULL           (err u207))

;; =============================================================
;;  CONSTANTS
;; =============================================================

;; Registration is free -- no STX fee required
(define-constant REGISTRATION-FEE u0)

;; Maximum tokens tracked per owner (Clarity list size must be fixed)
(define-constant MAX-TOKENS-PER-OWNER u50)

;; The principal that deployed the registry collects fees
(define-constant registry-owner tx-sender)

;; =============================================================
;;  DATA VARS
;; =============================================================

;; Auto-incrementing unique ID for each registered token
(define-data-var token-count uint u0)

;; Total STX fees collected (in micro-STX)
(define-data-var total-fees-collected uint u0)

;; =============================================================
;;  DATA MAPS
;; =============================================================

;; token-registry: token contract principal -> token metadata
(define-map token-registry
  principal
  {
    id:            uint,
    name:          (string-ascii 32),
    symbol:        (string-ascii 10),
    decimals:      uint,
    total-supply:  uint,
    token-uri:     (optional (string-utf8 256)),
    owner:         principal,
    registered-at: uint
  }
)

;; owner-tokens: owner principal -> list of token contract principals
(define-map owner-tokens
  principal
  (list 50 principal)
)

;; =============================================================
;;  PUBLIC FUNCTIONS
;; =============================================================

;; Register a deployed token contract in the StacksMint public registry.
;; Caller must pay a 1 STX registration fee (anti-spam).
;; Each token contract can only be registered once.
(define-public (register-token
    (token-contract principal)
    (name (string-ascii 32))
    (symbol (string-ascii 10))
    (decimals uint)
    (total-supply uint)
    (token-uri (optional (string-utf8 256))))
  (let
    (
      (caller tx-sender)
      (new-id (+ (var-get token-count) u1))
      (existing-tokens (default-to (list) (map-get? owner-tokens caller)))
    )
    ;; Validation guards
    (asserts! (is-none (map-get? token-registry token-contract)) ERR-ALREADY-REGISTERED)
    (asserts! (> (len name) u0) ERR-INVALID-NAME)
    (asserts! (> (len symbol) u0) ERR-INVALID-SYMBOL)
    (asserts! (> total-supply u0) ERR-INVALID-SUPPLY)
    (asserts! (< (len existing-tokens) MAX-TOKENS-PER-OWNER) ERR-LIST-FULL)

    ;; No registration fee -- registration is free

    ;; Store token metadata
    (map-set token-registry token-contract
      {
        id:            new-id,
        name:          name,
        symbol:        symbol,
        decimals:      decimals,
        total-supply:  total-supply,
        token-uri:     token-uri,
        owner:         caller,
        registered-at: stacks-block-height
      }
    )

    ;; Append to owner token list
    (map-set owner-tokens caller
      (unwrap! (as-max-len? (append existing-tokens token-contract) u50) ERR-LIST-FULL)
    )

    ;; Update global counters
    (var-set token-count new-id)
    (var-set total-fees-collected (+ (var-get total-fees-collected) REGISTRATION-FEE))

    ;; Emit registration event
    (print {
      event:          "token-registered",
      id:             new-id,
      token-contract: token-contract,
      name:           name,
      symbol:         symbol,
      owner:          caller
    })

    (ok new-id)
  )
)

;; Update the token URI for a previously registered token.
;; Only the original registrant can update it.
(define-public (update-token-uri
    (token-contract principal)
    (new-uri (optional (string-utf8 256))))
  (let
    (
      (entry (unwrap! (map-get? token-registry token-contract) ERR-TOKEN-NOT-FOUND))
    )
    (asserts! (is-eq tx-sender (get owner entry)) ERR-NOT-AUTHORIZED)
    (map-set token-registry token-contract
      (merge entry { token-uri: new-uri })
    )
    (ok true)
  )
)

;; =============================================================
;;  READ-ONLY FUNCTIONS
;; =============================================================

;; Retrieve full metadata for a registered token by contract principal
(define-read-only (get-token-info (token-contract principal))
  (map-get? token-registry token-contract)
)

;; Retrieve all token contract principals registered by an owner
(define-read-only (get-tokens-by-owner (owner principal))
  (default-to (list) (map-get? owner-tokens owner))
)

;; Return the total number of tokens registered in the registry
(define-read-only (get-token-count)
  (ok (var-get token-count))
)

;; Return the current registration fee (in micro-STX)
(define-read-only (get-registration-fee)
  (ok REGISTRATION-FEE)
)

;; Return total STX fees collected by the registry (in micro-STX)
(define-read-only (get-total-fees-collected)
  (ok (var-get total-fees-collected))
)

;; Return the registry owner principal (fee recipient)
(define-read-only (get-registry-owner)
  (ok registry-owner)
)

;; Check whether a specific token contract is already registered
(define-read-only (is-registered (token-contract principal))
  (is-some (map-get? token-registry token-contract))
)
