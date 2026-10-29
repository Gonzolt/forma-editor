class JobGate {
  constructor(busy) {
    this.busy = busy;
    this.pending = null;
    this.closed = false;
  }
  assertIdle() {
    if (this.closed) throw new Error("Forma is closing.");
    if (this.pending || this.busy())
      throw new Error(
        "An edit or export is already running. Finish it or stop it before starting another.",
      );
  }
  start(operation) {
    this.assertIdle();
    const pending = Promise.resolve().then(operation);
    this.pending = pending;
    return pending.finally(() => {
      if (this.pending === pending) this.pending = null;
    });
  }
  async close() {
    this.closed = true;
    await this.pending?.catch(() => {});
  }
  reopen() {
    this.closed = false;
  }
}
module.exports = { JobGate };
