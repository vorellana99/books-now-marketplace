import { InMemorySessionRepository } from '../../fakes/in-memory-session-repository.js';
import { sessionRepositoryContract } from '../../support/session-repository.contract.js';

sessionRepositoryContract('fake en memoria', () => {
  const repo = new InMemorySessionRepository();
  return Promise.resolve({
    repo,
    prepare: () => Promise.resolve(),
    rows: () => Promise.resolve(repo.rows()),
    setDates: (id, dates) => Promise.resolve(repo.setDates(id, dates)),
  });
});
