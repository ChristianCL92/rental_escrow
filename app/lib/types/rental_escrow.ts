/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/rental_escrow.json`.
 */
export type RentalEscrow = {
  "address": "2mGptfx2M9rTGsGExE9T3yLZ6MHSXLcgiQjD1NoVsfVa",
  "metadata": {
    "name": "rentalEscrow",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Created with Anchor"
  },
  "instructions": [
    {
      "name": "cancelBooking",
      "discriminator": [
        139,
        162,
        116,
        202,
        78,
        140,
        139,
        90
      ],
      "accounts": [
        {
          "name": "escrowAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "guest"
              },
              {
                "kind": "account",
                "path": "escrow_account.apartment_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true
        },
        {
          "name": "guest",
          "writable": true,
          "signer": true
        },
        {
          "name": "guestTokenAccount",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "escrowAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "guest"
              },
              {
                "kind": "arg",
                "path": "apartmentId"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true
        },
        {
          "name": "guestTokenAccount",
          "writable": true
        },
        {
          "name": "guest",
          "writable": true,
          "signer": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "owner",
          "docs": [
            "No need to validate because I am just recording when owner wallet receives payment later"
          ]
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "apartmentId",
          "type": "u64"
        },
        {
          "name": "amount",
          "type": "u64"
        },
        {
          "name": "rentTime",
          "type": "u64"
        }
      ]
    },
    {
      "name": "releasePayment",
      "discriminator": [
        24,
        34,
        191,
        86,
        145,
        160,
        183,
        233
      ],
      "accounts": [
        {
          "name": "escrowAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  101,
                  115,
                  99,
                  114,
                  111,
                  119
                ]
              },
              {
                "kind": "account",
                "path": "guest"
              },
              {
                "kind": "account",
                "path": "escrow_account.apartment_id",
                "account": "escrowAccount"
              }
            ]
          }
        },
        {
          "name": "escrowTokenAccount",
          "writable": true
        },
        {
          "name": "ownerTokenAccount",
          "writable": true
        },
        {
          "name": "guest",
          "writable": true
        },
        {
          "name": "usdcMint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": []
    }
  ],
  "accounts": [
    {
      "name": "escrowAccount",
      "discriminator": [
        36,
        69,
        48,
        18,
        128,
        225,
        125,
        135
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "paymentAlreadyReleased",
      "msg": "Payment has already been released"
    },
    {
      "code": 6001,
      "name": "checkInDateNotReached",
      "msg": "Check-in date has not been reached yet"
    },
    {
      "code": 6002,
      "name": "cannotCancelAfterCheckIn",
      "msg": "Cannot cancel booking after check-in date"
    },
    {
      "code": 6003,
      "name": "invalidGuest",
      "msg": "Invalid guest address"
    }
  ],
  "types": [
    {
      "name": "escrowAccount",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "apartmentId",
            "type": "u64"
          },
          {
            "name": "amount",
            "type": "u64"
          },
          {
            "name": "ownerAddress",
            "type": "pubkey"
          },
          {
            "name": "guestAddress",
            "type": "pubkey"
          },
          {
            "name": "rentTime",
            "type": "u64"
          },
          {
            "name": "rentStarted",
            "type": "bool"
          },
          {
            "name": "rentEnded",
            "type": "bool"
          },
          {
            "name": "reserved",
            "type": {
              "array": [
                "u8",
                64
              ]
            }
          }
        ]
      }
    }
  ]
};