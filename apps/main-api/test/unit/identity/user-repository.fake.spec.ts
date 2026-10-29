import { InMemoryUserRepository } from '../../fakes/in-memory-user-repository.js';
import { userRepositoryContract } from '../../support/user-repository.contract.js';

userRepositoryContract('fake en memoria', () => {
  const repo = new InMemoryUserRepository();
  return Promise.resolve({
    repo,
    published: () => Promise.resolve(repo.published()),
    count: () => Promise.resolve(repo.count()),
  });
});
