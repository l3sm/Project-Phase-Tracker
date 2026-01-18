const settingsButton = document.getElementById("btnSettings");
const createButton = document.getElementById("btnCreate");

settingsButton?.addEventListener("click", () => {
  console.log("settings clicked");
});

createButton?.addEventListener("click", () => {
  console.log("create clicked");
});

document.addEventListener("keydown", (event) => {
  if (event.shiftKey && event.key.toLowerCase() === "n") {
    console.log("shortcut: new project");
  }
});
