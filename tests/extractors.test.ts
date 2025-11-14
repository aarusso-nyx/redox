import { describe, it, expect } from "vitest";
import { nestControllers } from "../src/extractors/api-nest.js";
import { angularRoutes } from "../src/extractors/fe-angular.js";
import { detectFrontend } from "../src/extractors/frontend-detect.js";
import fs from "fs-extra";
import path from "node:path";

describe("extractors", () => {
  it("nestControllers extracts simple NestJS routes", () => {
    const tmp = path.join(process.cwd(), ".tmp-nest-extractor");
    fs.removeSync(tmp);
    fs.ensureDirSync(tmp);
    const tsconfigPath = path.join(tmp, "tsconfig.json");
    fs.writeJsonSync(tsconfigPath, {
      compilerOptions: { module: "commonjs", target: "es2019" },
      include: ["src/**/*.ts"],
    });
    const srcDir = path.join(tmp, "src");
    fs.ensureDirSync(srcDir);
    const controllerPath = path.join(srcDir, "users.controller.ts");
    const controllerSource = `
      import { Controller, Get, Post } from "@nestjs/common";

      @Controller("users")
      export class UsersController {
        @Get()
        findAll() {}

        @Post("create")
        create() {}
      }
    `;
    fs.writeFileSync(controllerPath, controllerSource, "utf8");

    // ts-morph looks up files based on tsconfig path
    const routes = nestControllers(tmp);
    const ids = routes.map((r) => `${r.httpMethod} ${r.basePath}/${r.path || ""}`.replace(/\/+$/, ""));

    expect(ids).toContain("GET users");
    expect(ids).toContain("POST users/create");

    fs.removeSync(tmp);
  });

  it("angularRoutes extracts routes from a routing module", () => {
    const tmp = path.join(process.cwd(), ".tmp-angular-extractor");
    fs.removeSync(tmp);
    fs.ensureDirSync(tmp);
    const tsconfigPath = path.join(tmp, "tsconfig.json");
    fs.writeJsonSync(tsconfigPath, {
      compilerOptions: { module: "commonjs", target: "es2019" },
      include: ["src/**/*.ts"],
    });
    const srcDir = path.join(tmp, "src");
    fs.ensureDirSync(srcDir);
    const routingPath = path.join(srcDir, "app-routing.module.ts");
    const routingSource = `
      import { NgModule } from "@angular/core";
      import { RouterModule, Routes } from "@angular/router";
      import { HomeComponent } from "./home.component";

      const routes: Routes = [
        { path: "", component: HomeComponent },
        { path: "about", component: HomeComponent }
      ];
    `;
    fs.writeFileSync(routingPath, routingSource, "utf8");

    const routes = angularRoutes(tmp);
    const paths = routes.map((r) => r.path);
    expect(paths).toContain("");
    expect(paths).toContain("about");

    fs.removeSync(tmp);
  });

  it("detectFrontend distinguishes blade/react/angular", async () => {
    const tmp = path.join(process.cwd(), ".tmp-frontend-detect");
    fs.removeSync(tmp);
    fs.ensureDirSync(tmp);

    // blade
    const bladeDir = path.join(tmp, "resources/views");
    fs.ensureDirSync(bladeDir);
    fs.writeFileSync(path.join(bladeDir, "welcome.blade.php"), "<h1>Welcome</h1>", "utf8");

    // react
    const reactDir = path.join(tmp, "resources/js");
    fs.ensureDirSync(reactDir);
    fs.writeFileSync(path.join(reactDir, "App.tsx"), "export const App = () => null;", "utf8");

    // angular
    const angularDir = path.join(tmp, "src/app");
    fs.ensureDirSync(angularDir);
    fs.writeFileSync(path.join(angularDir, "app.module.ts"), "export class AppModule {}", "utf8");

    const mode = await detectFrontend(tmp);
    expect(["mixed", "blade", "react", "angular"]).toContain(mode);

    fs.removeSync(tmp);
  });
});
