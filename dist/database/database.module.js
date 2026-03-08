"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DatabaseModule = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const typeorm_1 = require("@nestjs/typeorm");
const contest_entity_1 = require("./entities/contest.entity");
const contest_problem_entity_1 = require("./entities/contest-problem.entity");
const contest_user_entity_1 = require("./entities/contest-user.entity");
const contest_user_problem_entity_1 = require("./entities/contest-user-problem.entity");
const course_entity_1 = require("./entities/course.entity");
const course_problem_entity_1 = require("./entities/course-problem.entity");
const course_user_entity_1 = require("./entities/course-user.entity");
const game_entity_1 = require("./entities/game.entity");
const gamer_entity_1 = require("./entities/gamer.entity");
const log_entity_1 = require("./entities/log.entity");
const match_entity_1 = require("./entities/match.entity");
const match_gamer_link_entity_1 = require("./entities/match-gamer-link.entity");
const media_entity_1 = require("./entities/media.entity");
const notification_entity_1 = require("./entities/notification.entity");
const problem_entity_1 = require("./entities/problem.entity");
const rejudge_log_entity_1 = require("./entities/rejudge-log.entity");
const setting_entity_1 = require("./entities/setting.entity");
const submission_entity_1 = require("./entities/submission.entity");
const submission_misc_entity_1 = require("./entities/submission-misc.entity");
const suspicion_entity_1 = require("./entities/suspicion.entity");
const tag_entity_1 = require("./entities/tag.entity");
const user_entity_1 = require("./entities/user.entity");
const user_meta_entity_1 = require("./entities/user-meta.entity");
const entities = [
    user_entity_1.User,
    user_meta_entity_1.UserMeta,
    problem_entity_1.Problem,
    submission_entity_1.Submission,
    submission_misc_entity_1.SubmissionMisc,
    suspicion_entity_1.Suspicion,
    rejudge_log_entity_1.RejudgeLog,
    contest_entity_1.Contest,
    contest_user_entity_1.ContestUser,
    contest_problem_entity_1.ContestProblem,
    contest_user_problem_entity_1.ContestUserProblem,
    course_entity_1.Course,
    course_user_entity_1.CourseUser,
    course_problem_entity_1.CourseProblem,
    tag_entity_1.Tag,
    log_entity_1.Log,
    notification_entity_1.Notification,
    media_entity_1.Media,
    setting_entity_1.Setting,
    game_entity_1.Game,
    gamer_entity_1.Gamer,
    match_entity_1.Match,
    match_gamer_link_entity_1.MatchGamerLink,
];
let DatabaseModule = class DatabaseModule {
};
exports.DatabaseModule = DatabaseModule;
exports.DatabaseModule = DatabaseModule = __decorate([
    (0, common_1.Module)({
        imports: [
            typeorm_1.TypeOrmModule.forRootAsync({
                inject: [config_1.ConfigService],
                useFactory: (config) => ({
                    type: 'mysql',
                    driver: require('mysql2'),
                    host: config.get('database.host'),
                    port: config.get('database.port'),
                    database: config.get('database.database'),
                    username: config.get('database.username'),
                    password: config.get('database.password'),
                    entities,
                    synchronize: process.env.NODE_ENV !== 'production',
                    logging: process.env.NODE_ENV === 'development',
                    charset: 'utf8mb4',
                }),
            }),
        ],
        exports: [typeorm_1.TypeOrmModule],
    })
], DatabaseModule);
//# sourceMappingURL=database.module.js.map