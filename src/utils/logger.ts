import debug from "debug";

const originalFormatArgs = debug.formatArgs;
debug.formatArgs = function (args) {
  originalFormatArgs.call(this, args);
  const line: string = args[0];
  const noColorsPrefix = ` ${this.namespace} `;
  const colorsPrefix = `${this.namespace}`;
  const noColorsStartsAt = line.indexOf(noColorsPrefix);
  if (noColorsStartsAt > -1) {
    args[0] = line.slice(noColorsStartsAt + noColorsPrefix.length);
  } else {
    const colorsStartsAt = line.indexOf(colorsPrefix);
    args[0] = line.slice(colorsStartsAt + colorsPrefix.length);
  }
};

export class LoggerContext {
  private indent = {
    level: 0,
    str: "",
    times: [] as number[],
  };
  private maxIdLength = 0;
  private idUpdateFns: ((len: number) => void)[] = [];
  private logger = debug("composition");
  private firstLoggerAt: number = 0;

  down(time: number) {
    this.updateIndent(+1, time);
  }

  up(time: number) {
    if (this.indent.level > 0) {
      this.updateIndent(-1, time);
      return this.indent.times.pop();
    }
  }

  getTime() {
    if (!this.firstLoggerAt) {
      this.firstLoggerAt = Date.now();
      return 0;
    }

    return Date.now() - this.firstLoggerAt;
  }

  getIndent() {
    return this.indent;
  }

  register(id: string, idUpdateFn: (len: number) => void) {
    idUpdateFn(this.maxIdLength);

    this.idUpdateFns.push(idUpdateFn);
    const newMaxIdLength = Math.max(this.maxIdLength, id.length);
    if (newMaxIdLength > this.maxIdLength) {
      this.maxIdLength = newMaxIdLength;
      this.idUpdateFns.forEach((fn) => fn(newMaxIdLength));
    }

    return this.logger.extend(id);
  }

  private updateIndent(delta: number, time: number) {
    if (this.indent.level + delta < 0) {
      return;
    }

    if (delta > 0) {
      this.indent.times.push(time);
    }

    this.indent.level += delta;
    this.indent.str = "│ ".repeat(this.indent.level);
  }
}

export class Logger {
  public isEnabled: boolean;
  private debug: debug.Debugger;
  private idPrefix: string;

  constructor(
    private id: string,
    private context: LoggerContext,
  ) {
    this.id = id;
    this.context = context;
    this.idPrefix = `${id}`;
    this.debug = this.context.register(
      this.id,
      this._updateIdPrefix.bind(this),
    );
    this.isEnabled = this.debug.enabled;
    // quick fix to ignore process.stderr.write in Node
    this.debug.log = console.log;
  }

  log(msg: string | (() => string), prefix = "- ") {
    if (this.isEnabled) {
      this._log(prefix, msg);
    }
  }

  group(msg: string | (() => string)) {
    if (this.isEnabled) {
      this.log(msg, "┌ ");
      this.context.down(Date.now());
    }
  }

  groupEnd(msg?: string | (() => string)) {
    if (this.isEnabled) {
      const time = this.context.up(Date.now());

      let message = msg ? (typeof msg === "string" ? msg : msg()) : "";

      if (time) {
        message += ` (${Date.now() - time}ms)`;
      }

      this.log(message, "└ ");
    }
  }

  create(id: string) {
    return new Logger(id, this.context);
  }

  private _log(prefix: string, msg: string | (() => string)) {
    const indent = this.context.getIndent().str;
    const message = typeof msg === "string" ? msg : msg();
    if (this.isEnabled) {
      const sinceStart = this.context.getTime();
      const text =
        this.idPrefix + " " + indent + prefix + message + ` +${sinceStart}ms`;
      this.debug(text);
    }
  }

  private _updateIdPrefix(maxLength: number) {
    this.idPrefix = this.id.padEnd(maxLength, " ");
  }
}
