import Command from '../command';
export default class Serve extends Command {
    static description: string;
    static flags: {
        help: import("@oclif/parser/lib/flags").IBooleanFlag<void>;
        port: import("@oclif/parser/lib/flags").IOptionFlag<number>;
        nobundle: import("@oclif/parser/lib/flags").IBooleanFlag<boolean>;
    };
    run(): Promise<void>;
}
