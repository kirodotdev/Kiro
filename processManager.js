const { spawn } = require('child_process');
let runningProcess = null;

function runCommand(command, args) {
  runningProcess = spawn(command, args, { shell: true, stdio: 'inherit' });

  runningProcess.on('exit', (code) => {
    runningProcess = null;
    console.log(`Process exited with code ${code}`);
  });
}

function killRunningProcess() {
  if (runningProcess) {
    runningProcess.kill('SIGTERM'); // Or 'SIGKILL' if needed
    console.log('Process killed manually.');
  } else {
    console.log('No running process to kill.');
  }
}

// Example usage:

// Example: Run 'ping localhost' and kill after 5 seconds
runCommand('ping', ['localhost']);

setTimeout(() => {
  killRunningProcess();
}, 5000);