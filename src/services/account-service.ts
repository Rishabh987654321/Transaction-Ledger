import { AccountRepository } from "../repositories/account-repository.js";
import { AccountNotFoundError } from "../errors/app-error.js";
import { minorToDecimalString } from "../utils/money.js";

export interface AccountResponse {
  id: string;
  name: string;
  balance: string;
  created_at: string;
}

export interface AccountBalanceResponse {
  account_id: string;
  balance: string;
}

export class AccountService {
  constructor(private readonly accountRepository: AccountRepository) {}

  async createAccount(name: string): Promise<AccountResponse> {
    const account = await this.accountRepository.create(name);
    return {
      id: account.id,
      name: account.name,
      balance: minorToDecimalString(account.balanceMinor),
      created_at: account.createdAt.toISOString(),
    };
  }

  async getAccountBalance(id: string): Promise<AccountBalanceResponse> {
    const account = await this.accountRepository.findById(id);
    if (!account) {
      throw new AccountNotFoundError();
    }
    return {
      account_id: account.id,
      balance: minorToDecimalString(account.balanceMinor),
    };
  }
}
