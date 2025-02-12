import * as anchor from '@coral-xyz/anchor'
import {BN, Program} from '@coral-xyz/anchor'
import {Keypair, PublicKey} from '@solana/web3.js'
import {Tokenvesting} from '../target/types/tokenvesting'
import { BanksClient, Clock, ProgramTestContext, startAnchor } from "solana-bankrun"
import IDL from "../target/idl/tokenvesting.json"
import { SYSTEM_PROGRAM_ID } from '@coral-xyz/anchor/dist/cjs/native/system'
import { BankrunProvider } from "anchor-bankrun"
import NodeWallet from '@coral-xyz/anchor/dist/cjs/nodewallet'
import { TOKEN_PROGRAM_ID } from '@solana/spl-token'
// import { createMint } from "spl-token-bankrun";
const { createMint, mintTo } = require("spl-token-bankrun");

describe('tokenvesting', () => {
  const CompanyName = "CompanyName";
  let beneficiary: Keypair;
  let context: ProgramTestContext;
  let provider: BankrunProvider;
  let program: Program<Tokenvesting>;
  let banksClient: BanksClient;
  let employer: Keypair;
  let mint: PublicKey;
  let beneficiaryProvider: BankrunProvider;
  let program2: Program<Tokenvesting>;
  let vestingAccountKey: PublicKey;
  let treasuryTokenAccount: PublicKey;
  let employeeAccount: PublicKey;

  beforeAll(async () => {
    beneficiary = new anchor.web3.Keypair();

    context = await startAnchor(
      "",
      [{name: "tokenvesting", programId: new PublicKey(IDL.address)}],
      [{
        address: beneficiary.publicKey,
        info: {
          lamports: 1_000_000_000,
          data: Buffer.alloc(0),
          owner: SYSTEM_PROGRAM_ID,
          executable: false,
        }
      }]
    );

    provider = new BankrunProvider(context);

    anchor.setProvider(provider);

    program = new Program<Tokenvesting>(IDL as Tokenvesting, provider);

    banksClient = context.banksClient;

    employer = provider.wallet.payer;

    mint = await createMint(banksClient, employer, employer.publicKey, null, 2);

    beneficiaryProvider = new BankrunProvider(context);
    beneficiaryProvider.wallet = new NodeWallet(beneficiary);

    program2 = new Program<Tokenvesting>(IDL as Tokenvesting, beneficiaryProvider);

    [vestingAccountKey] = PublicKey.findProgramAddressSync(
      [Buffer.from(CompanyName)],
      program.programId
    );

    [treasuryTokenAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("vesting_treasury"), Buffer.from(CompanyName)],
      program.programId,
    );

    [employeeAccount] = PublicKey.findProgramAddressSync(
      [Buffer.from("employee_vesting"), beneficiary.publicKey.toBuffer(), vestingAccountKey.toBuffer()],
      program.programId,
    )

  })

  it('should create a vesting account', async () => {
      const tx = await program.methods.createVestingAccount(CompanyName).accounts({
        signer: employer.publicKey,
        mint,
        tokenProgram: TOKEN_PROGRAM_ID,
      }).rpc({ commitment: "confirmed" });

      const vestingAccountData = await program.account.vestingAccount.fetch(vestingAccountKey, "confirmed");

      console.log(vestingAccountData);
      console.log("Create vesting account", tx);
  });

  it('should fund the treasury token account', async() => {
    const amount = 10_000 * 10**9;
    const mintTx = await mintTo(banksClient, employer, mint, treasuryTokenAccount, employer, amount);

    console.log("Mint transaction", mintTx);

  });

  it('should create an employee vesting account', async () => {
    const tx2 = await program.methods.createEmployeeAccount(
      new BN(0), 
      new BN(100), 
      new BN(100), 
      new BN(0)).accounts(
        {
          beneficiary: beneficiary.publicKey, 
          vestingAccount: vestingAccountKey
        }
      ).rpc({ commitment: 'confirmed', skipPreflight: true });

      console.log('Create employee Account Tx', tx2);
      console.log('Employee Account', employeeAccount.toBase58());
  });

  it("should claim the employee's vested tokend", async () => {
    const currentClock = await banksClient.getClock();
    context.setClock( new Clock(
      currentClock.slot,
      currentClock.epochStartTimestamp,
      currentClock.epoch,
      currentClock.leaderScheduleEpoch,
      currentClock.unixTimestamp,
    ));

    const tx3 = await program2.methods.claimTokens(CompanyName).accounts({ tokenProgram: TOKEN_PROGRAM_ID }).rpc({ commitment: 'confirmed' });

    console.log('Claim Token Tx:', tx3);
  });

})
