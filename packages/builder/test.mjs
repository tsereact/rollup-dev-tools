import { resolve } from "path";

import { getPluginConfiguration } from "@yarnpkg/cli";
import { Configuration, Project, Manifest, Workspace } from "@yarnpkg/core";
import { npath } from "@yarnpkg/fslib";

process.chdir("../..");
const cfg = await Configuration.find(npath.cwd(), getPluginConfiguration());
const { project } = await Project.find(cfg, npath.cwd());
//console.log(pkg);
