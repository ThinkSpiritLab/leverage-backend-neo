#!/usr/bin/env python3
"""Disposable, trusted-code Docker judge probe. No mounts or host env passed to containers."""
import argparse
import base64
import json
import os
import selectors
import subprocess
import time
import uuid

PY = """import json,sys
for line in sys.stdin:
    request=json.loads(line)
    print(json.dumps({'sum':sum(request['values'])}),flush=True)
"""
FLAGS = [
    '--network=none', '--cap-drop=ALL', '--security-opt=no-new-privileges',
    '--memory=128m', '--memory-swap=128m', '--cpus=0.5', '--pids-limit=64',
    '--read-only', '--tmpfs=/tmp:rw,exec,nosuid,nodev,size=16m,mode=1777',
    '--user=65534:65534', '--ipc=none', '--ulimit=nofile=64:64',
    '--workdir=/tmp',
]


def docker(*args, timeout=8):
    return subprocess.run(['docker', *args], capture_output=True, text=True, timeout=timeout)


def run(image, command, *, data=b'', timeout=8, cap=4096, interactive=False):
    name = 'spike-judge-' + uuid.uuid4().hex[:12]
    argv = ['docker', 'run', '--rm', '--name', name, '-i', *FLAGS, image, *command]
    start = time.monotonic()
    p = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    selector = selectors.DefaultSelector()
    for stream in (p.stdout, p.stderr):
        os.set_blocking(stream.fileno(), False)
        selector.register(stream, selectors.EVENT_READ)
    out, err = bytearray(), bytearray()
    status = 'exited'
    extra = {}

    def drain(until_line=False):
        nonlocal status
        deadline = time.monotonic() + timeout
        while selector.get_map():
            if until_line and b'\n' in out:
                break
            if time.monotonic() >= deadline:
                status = 'timeout'
                break
            events = selector.select(max(0, deadline - time.monotonic()))
            for key, _ in events:
                chunk = os.read(key.fd, 4096)
                if not chunk:
                    selector.unregister(key.fileobj)
                    continue
                target = out if key.fileobj is p.stdout else err
                remaining = max(0, cap - len(out) - len(err))
                target.extend(chunk[:remaining])
                if len(chunk) > remaining:
                    status = 'output_limit'
                    break
            if status != 'exited':
                break
        return status == 'exited'

    try:
        if interactive:
            for request in (b'{"values":[2,3]}\n', b'{"values":[9,-4]}\n'):
                sent_at = time.monotonic()
                p.stdin.write(request)
                p.stdin.flush()
                if not drain(until_line=True):
                    break
                extra.setdefault('roundtrip_ms', []).append(round((time.monotonic()-sent_at)*1000, 1))
                extra.setdefault('responses', []).append(out.decode().split('\n', 1)[0])
                out[:] = out.split(b'\n', 1)[1]
                if len(extra['responses']) == 1:
                    stats = docker('stats', '--no-stream', '--format', '{{.MemUsage}} | {{.PIDs}}', name)
                    extra['container_stats'] = stats.stdout.strip() or stats.stderr.strip()
                    inspect = docker('inspect', '--format', '{{json .HostConfig}}', name)
                    if inspect.returncode == 0:
                        cfg = json.loads(inspect.stdout)
                        extra['host_config'] = {k: cfg[k] for k in ('NetworkMode', 'CapDrop', 'SecurityOpt', 'Memory', 'MemorySwap', 'NanoCpus', 'PidsLimit', 'ReadonlyRootfs', 'Tmpfs', 'Binds', 'IpcMode')}
            p.stdin.close()
        else:
            if data:
                p.stdin.write(data)
                p.stdin.flush()
            p.stdin.close()
        if status == 'exited':
            drain()
    finally:
        if status != 'exited' or p.poll() is None:
            # On timeout/limit, kill the container (not just the Docker CLI).
            if status != 'exited':
                docker('rm', '-f', name)
        try:
            p.wait(timeout=5)
        except subprocess.TimeoutExpired:
            docker('rm', '-f', name)
            p.kill()
            p.wait()
        selector.close()
        # --rm should have removed it; assert this even for timeout/limit.
        absent = docker('container', 'inspect', name)
        extra['cleaned'] = absent.returncode != 0
    return dict(status=status, exit_code=p.returncode, elapsed_ms=round((time.monotonic()-start)*1000, 1),
                stdout=out.decode(errors='replace')[:300], stderr=err.decode(errors='replace')[:300], **extra)


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--node-image', default=None, help='already local Node image (optional)')
    args = parser.parse_args()
    results = {}
    py = 'python:3.11-alpine'
    for image in (py, 'golang:1.26.5-bookworm', *([args.node_image] if args.node_image else [])):
        if docker('image', 'inspect', image).returncode != 0:
            parser.error(f'Image {image} is not local; pull only after reviewing its size and disk space')
    results['python_one_shot_ms'] = []
    for _ in range(3):
        r = run(py, ['python', '-u', '-c', PY], data=b'{"values":[2,3]}\n')
        assert r['status'] == 'exited' and r['cleaned'] and r['exit_code'] == 0 and json.loads(r['stdout']) == {'sum':5}, r
        results['python_one_shot_ms'].append(r['elapsed_ms'])
    results['python_interactive'] = run(py, ['python', '-u', '-c', PY], interactive=True)
    results['network'] = run(py, ['python', '-c', 'import socket; s=socket.socket(); s.settimeout(1); s.connect(("1.1.1.1",53))'])
    results['timeout'] = run(py, ['python', '-c', 'while True: pass'], timeout=1)
    results['output_cap'] = run(py, ['python', '-u', '-c', 'print("x"*50000)'], cap=2048)
    results['process_rss'] = run(py, ['python', '-c', 'import resource; print(resource.getrusage(resource.RUSAGE_SELF).ru_maxrss)'])
    # C++ source is fixed, authored here. Pass it as base64 argv, never mount the host.
    source = '#include <iostream>\nint main(){int a,b;std::cin>>a>>b;std::cout<<a+b<<"\\n";}\n'
    encoded = base64.b64encode(source.encode()).decode()
    shell = f'printf %s {encoded} | base64 -d > /tmp/main.cpp && g++ -O0 /tmp/main.cpp -o /tmp/judge && printf "2 3\\n" | /tmp/judge'
    results['cpp'] = run('golang:1.26.5-bookworm', ['sh', '-c', shell], timeout=25)
    if args.node_image:
        node = 'let s="";process.stdin.on("data", x => s+=x);process.stdin.on("end",()=>console.log(JSON.stringify({sum:JSON.parse(s).values.reduce((a,b)=>a+b,0)})))'
        results['node'] = run(args.node_image, ['node', '-e', node], data=b'{"values":[2,3]}\n')
        # Node 22's built-in strip-types supports erasable TS, not full tsc semantics.
        ts = 'const values: number[] = [2, 3]; console.log(JSON.stringify({sum: values.reduce((a,b)=>a+b,0)}));\n'
        encoded_ts = base64.b64encode(ts.encode()).decode()
        results['typescript_strip_types'] = run(args.node_image, ['sh', '-c',
            f'printf %s {encoded_ts} | base64 -d > /tmp/main.ts && node --experimental-strip-types /tmp/main.ts'])
    print(json.dumps(results, indent=2))
    assert results['python_interactive']['responses'] == ['{"sum": 5}', '{"sum": 5}']
    assert results['network']['exit_code'] != 0 and 'Network unreachable' in results['network']['stderr']
    assert results['timeout']['status'] == 'timeout' and results['timeout']['cleaned']
    assert results['output_cap']['status'] == 'output_limit' and results['output_cap']['cleaned']
    assert results['cpp']['stdout'] == '5\n' and results['cpp']['cleaned']
    if args.node_image:
        assert json.loads(results['node']['stdout']) == {'sum':5} and results['node']['cleaned']
        assert json.loads(results['typescript_strip_types']['stdout']) == {'sum':5} and results['typescript_strip_types']['cleaned']


if __name__ == '__main__':
    main()
