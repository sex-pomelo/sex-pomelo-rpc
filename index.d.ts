import { EventEmitter } from "events";

export namespace client {
    export function create(opts?: ClientOptions): RpcClient;

    export class RpcClient extends EventEmitter {
        proxies: {
            [namespace: string]: {
                [serverType: string]: {
                    [service: string]: {
                        [method: string]: (...args: any[]) => void;
                    }
                }
            }
        };
        start(cb: (err?: Error) => void): void;
        stop(force?: boolean): void;
        addProxy(record: { namespace: string; serverType: string; path: string }): void;
        addProxies(records: Array<{ namespace: string; serverType: string; path: string }>): void;
        addServer(server: ServerInfo): void;
        addServers(servers: ServerInfo[]): void;
        removeServer(id: string | number): void;
        removeServers(ids: (string | number)[]): void;
        replaceServers(servers: ServerInfo[]): void;
        rpcInvoke(serverId: string, msg: RpcMsg, cb: (err?: Error, ...args: any[]) => void): void;
        before(filter: rpcFilter): void;
        after(filter: rpcFilter): void;
        filter(filter: rpcFilter): void;
        setErrorHandler(handler: (err: Error, msg: RpcMsg, resp: any, serverId: string, cb: (...args: any[]) => void) => void): void;
    }

    export interface ClientOptions {
        context?: any;
        routeContext?: any;
        router?: ((routeParam: any, msg: RpcMsg, routeContext: any, cb: (err?: Error, serverId?: string) => void) => void) | { route: (routeParam: any, msg: RpcMsg, routeContext: any, cb: (err?: Error, serverId?: string) => void) => void };
        routerType?: 'roundrobin' | 'weight-roundrobin' | 'least-active' | 'consistent-hash' | string;
        rpcDebugLog?: boolean;
        clientId?: string;
        mailboxFactory?: any;
        bufferMsg?: boolean;
        keepalive?: number;
        interval?: number;
        timeout?: number;
        rpcLogger?: any;
    }

    export interface ServerInfo {
        id: string;
        host: string;
        port: number;
        serverType?: string;
        [key: string]: any;
    }

    export interface RpcMsg {
        namespace: string;
        serverType: string;
        service: string;
        method: string;
        args: any[];
    }

    export type rpcFilter = (serverId: string, msg: RpcMsg, opts: any, next: (serverId: string, msg: RpcMsg, opts: any) => void) => void;

    export class MQTTMailbox extends EventEmitter {
        constructor(server: ServerInfo, opts?: any);
        connect(tracer: any, cb: (err?: Error) => void): void;
        close(): void;
        send(tracer: any, msg: RpcMsg, opts: any, cb: (tracer: any, err?: Error, ...args: any[]) => void): void;
    }
}

export namespace server {
    export function create(opts: ServerOptions): RpcServer;

    export interface RpcServer extends EventEmitter {
        start(): void;
        stop(): void;
        on(event: 'error', listener: (err: Error) => void): this;
        on(event: 'closed', listener: () => void): this;
    }

    export interface ServerOptions {
        port: number;
        paths: { namespace: string; path: string }[];
        context?: any;
        acceptorFactory?: { create: (opts: any, cb: (tracer: any, msg: any, cb: (...args: any[]) => void) => void) => Acceptor };
        bufferMsg?: boolean;
        interval?: number;
        rpcLogger?: any;
        rpcDebugLog?: boolean;
        reloadRemotes?: boolean;
        services?: any;
    }

    export const MqttAcceptor: {
        create(opts: any, cb: (tracer: any, msg: any, cb: (...args: any[]) => void) => void): Acceptor;
    };

    export interface Acceptor extends EventEmitter {
        listen(port: number): void;
        close(): void;
        on(event: 'error', listener: (err: Error) => void): this;
        on(event: 'closed', listener: () => void): this;
    }
} 